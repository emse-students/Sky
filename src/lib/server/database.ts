import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { Person, JsonRelation, GraphDataFile } from "$types/graph";
import {
  normalizeName,
  nameDistance,
  NAME_MATCH_MAX_DISTANCE,
  formatFirstName,
  formatLastName,
} from "$utils/format";
import { layoutGraph } from "$server/positions";

const DB_PATH = path.join(process.cwd(), "database", "sky.db");
const SCHEMA_PATH = path.join(process.cwd(), "database", "schema.sql");

export { DB_PATH };

let db: Database.Database | null = null;

function initializeSchema(database: Database.Database): void {
  try {
    // Check if schema exists
    const tableCheck = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='people'",
      )
      .get();

    if (!tableCheck) {
      console.debug("[Database] Initializing schema...");

      // Try to read schema file
      if (fs.existsSync(SCHEMA_PATH)) {
        const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
        database.exec(schema);
        console.debug("[Database] Schema initialized from schema.sql");
      } else {
        // Fallback to inline schema if file not found
        console.debug("[Database] schema.sql not found, using inline schema");
        database.exec(`
					PRAGMA foreign_keys = ON;
					
					CREATE TABLE IF NOT EXISTS people (
						id TEXT PRIMARY KEY,
						first_name TEXT NOT NULL,
						last_name TEXT NOT NULL,
						level INTEGER,
						image_url TEXT,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						UNIQUE(id)
					);
					
					CREATE INDEX IF NOT EXISTS idx_people_level ON people(level);
					CREATE INDEX IF NOT EXISTS idx_people_last_name ON people(last_name);
					CREATE INDEX IF NOT EXISTS idx_people_first_name ON people(first_name);
					
					CREATE TABLE IF NOT EXISTS relationships (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						source_id TEXT NOT NULL,
						target_id TEXT NOT NULL,
						type TEXT NOT NULL DEFAULT 'parrainage',
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						FOREIGN KEY (source_id) REFERENCES people(id) ON DELETE CASCADE,
						FOREIGN KEY (target_id) REFERENCES people(id) ON DELETE CASCADE,
						UNIQUE(source_id, target_id, type)
					);
					
					CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
					CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
					CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);
					
					CREATE TABLE IF NOT EXISTS metadata (
						key TEXT PRIMARY KEY,
						value TEXT,
						updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
					);
					
					INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '3.0');
				`);
        console.debug("[Database] Schema initialized with inline fallback");
      }
    }
  } catch (error) {
    console.error("[Database] Failed to initialize schema:", error);
    throw error;
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure database directory exists
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("foreign_keys = ON");

    // Initialize schema if needed
    initializeSchema(db);
  }
  return db;
}

// ============================================
// PEOPLE OPERATIONS
// ============================================

export interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  level: number | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export function getAllPeople(): Person[] {
  const database = getDatabase();
  // Use SELECT * from people to avoid crashing if 'bio' column is missing (migration failed)
  const stmt = database.prepare(`
		SELECT *
		FROM people
		ORDER BY last_name, first_name
	`);

  const rows = stmt.all() as (PersonRow & { bio?: string })[];

  return rows.map((row) => {
    const person: Person = {
      id: row.id,
      level: row.level,
      bio: row.bio || undefined,
      image: row.image_url || undefined,
      prenom: row.first_name,
      nom: row.last_name,
    };

    // Get external links
    const linksStmt = database.prepare(
      "SELECT type, url FROM external_links WHERE person_id = ? ORDER BY display_order",
    );
    const links = linksStmt.all(row.id) as { type: string; url: string }[];
    if (links.length > 0) {
      person.links = Object.fromEntries(links.map((l) => [l.type, l.url]));
    }

    return person;
  });
}

export function getPersonById(id: string): Person | null {
  const database = getDatabase();
  // Use SELECT * to avoid crash if bio column missing
  const stmt = database.prepare(`
		SELECT *
		FROM people
		WHERE id = ?
	`);

  const row = stmt.get(id) as (PersonRow & { bio?: string }) | undefined;
  if (!row) {
    return null;
  }

  const person: Person = {
    id: row.id,
    level: row.level,
    bio: row.bio || undefined,
    image: row.image_url || undefined,
    prenom: row.first_name,
    nom: row.last_name,
  };

  // Get external links
  const linksStmt = database.prepare(
    "SELECT type, url FROM external_links WHERE person_id = ? ORDER BY display_order",
  );
  const links = linksStmt.all(row.id) as { type: string; url: string }[];
  if (links.length > 0) {
    person.links = Object.fromEntries(links.map((l) => [l.type, l.url]));
  }

  return person;
}

export function searchPeople(query: string): Person[] {
  const database = getDatabase();

  // Check if query is a year (4 digits)
  if (/^\d{4}$/.test(query)) {
    const stmt = database.prepare(`
			SELECT id FROM people
			WHERE level = ?
			LIMIT 50
		`);
    const rows = stmt.all(parseInt(query)) as { id: string }[];
    return rows
      .map((row) => getPersonById(row.id))
      .filter((p): p is Person => p !== null);
  }

  const stmt = database.prepare(`
		SELECT id FROM people_fts
		WHERE people_fts MATCH ?
		ORDER BY rank
		LIMIT 50
	`);

  // Add wildcards for FTS
  const searchQuery = `${query}*`;
  const rows = stmt.all(searchQuery) as { id: string }[];
  return rows
    .map((row) => getPersonById(row.id))
    .filter((p): p is Person => p !== null);
}

export function createPerson(
  person: Omit<Person, "id"> & { id?: string },
): string {
  const database = getDatabase();

  const id =
    person.id ||
    `${person.prenom}.${person.nom}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9.]/g, "");

  const stmt = database.prepare(`
		INSERT INTO people (id, first_name, last_name, level, bio, image_url)
		VALUES (?, ?, ?, ?, ?, ?)
	`);

  stmt.run(
    id,
    person.prenom,
    person.nom,
    person.level || null,
    person.bio || null,
    person.image || "default.jpg",
  );

  // Insert links
  if (person.links) {
    const linkStmt = database.prepare(`
			INSERT INTO external_links (person_id, type, url)
			VALUES (?, ?, ?)
		`);
    for (const [type, url] of Object.entries(person.links)) {
      linkStmt.run(id, type, url);
    }
  }

  return id;
}

export function updatePerson(id: string, updates: Partial<Person>): boolean {
  const database = getDatabase();

  const stmt = database.prepare(`
		UPDATE people
		SET 
			first_name = COALESCE(?, first_name),
			last_name = COALESCE(?, last_name),
			level = COALESCE(?, level),
			bio = COALESCE(?, bio),
			image_url = COALESCE(?, image_url),
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`);

  const result = stmt.run(
    updates.prenom || null,
    updates.nom || null,
    updates.level || null,
    updates.bio || null,
    updates.image || null,
    id,
  );

  // Update links if provided
  if (updates.links !== undefined) {
    database.prepare("DELETE FROM external_links WHERE person_id = ?").run(id);
    if (Object.keys(updates.links).length > 0) {
      const linkStmt = database.prepare(`
				INSERT INTO external_links (person_id, type, url)
				VALUES (?, ?, ?)
			`);
      for (const [type, url] of Object.entries(updates.links)) {
        try {
          linkStmt.run(id, type, url);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `[Database] Failed to insert link '${type}': ${url} for user ${id}. Error: ${message}`,
          );
        }
      }
    }
  }

  return result.changes > 0;
}

export function deletePerson(id: string): boolean {
  const database = getDatabase();
  const stmt = database.prepare("DELETE FROM people WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function mergePeople(sourceId: string, targetId: string): void {
  const database = getDatabase();

  database.transaction(() => {
    // 1. Move relationships requests (target_id = sourceId)
    // I am the TARGET (fillot), so these are my Parrains.
    const incoming = database
      .prepare(
        "SELECT id, source_id, type FROM relationships WHERE target_id = ?",
      )
      .all(sourceId) as { id: number; source_id: string; type: string }[];

    for (const rel of incoming) {
      try {
        database
          .prepare("UPDATE relationships SET target_id = ? WHERE id = ?")
          .run(targetId, rel.id);
      } catch {
        // Constraint violation (duplicate), delete this one
        console.warn(
          `Duplicate incoming relation from ${rel.source_id} during merge, deleting.`,
        );
        database.prepare("DELETE FROM relationships WHERE id = ?").run(rel.id);
      }
    }

    // 2. Move relationships source (source_id = sourceId)
    // I am the SOURCE (parrain), so these are my Fillots.
    const outgoing = database
      .prepare(
        "SELECT id, target_id, type FROM relationships WHERE source_id = ?",
      )
      .all(sourceId) as { id: number; target_id: string; type: string }[];

    for (const rel of outgoing) {
      try {
        database
          .prepare("UPDATE relationships SET source_id = ? WHERE id = ?")
          .run(targetId, rel.id);
      } catch {
        console.warn(
          `Duplicate outgoing relation to ${rel.target_id} during merge, deleting.`,
        );
        database.prepare("DELETE FROM relationships WHERE id = ?").run(rel.id);
      }
    }

    // 3. Move external links
    const links = database
      .prepare("SELECT id, url FROM external_links WHERE person_id = ?")
      .all(sourceId) as { id: number; url: string }[];

    for (const link of links) {
      try {
        database
          .prepare("UPDATE external_links SET person_id = ? WHERE id = ?")
          .run(targetId, link.id);
      } catch {
        // Duplicate url for target
        database
          .prepare("DELETE FROM external_links WHERE id = ?")
          .run(link.id);
      }
    }

    // 4. Delete the source person
    database.prepare("DELETE FROM people WHERE id = ?").run(sourceId);
  })();
}

// ============================================
// AUTH IDENTITY & SESSIONS
// ============================================

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 jours

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

/** Identite resolue depuis le SSO Authentik (claims). */
export interface OidcIdentity {
  sub: string;
  firstName: string;
  lastName: string;
  level: number | null;
  email: string | null;
  formation: string | null;
  role: string;
}

/** Fiche people resolue pour une session (locals.user cote serveur). */
export interface SessionPerson {
  id: string;
  prenom: string;
  nom: string;
  level: number | null;
  image: string | null;
  auth_sub: string | null;
  email: string | null;
  formation: string | null;
  role: string;
}

/** Fiche people deja liee a ce sub Authentik, sinon null. */
export function getPersonIdByAuthSub(authSub: string): string | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT id FROM people WHERE auth_sub = ?")
    .get(authSub) as { id: string } | undefined;
  return row?.id ?? null;
}

/** Fiche candidate a une liaison (meme nom/prenom, non liee). */
export interface MatchCandidate {
  id: string;
  firstName: string;
  lastName: string;
  level: number | null;
}

/**
 * Fiches people NON liees dont le nom+prenom normalises correspondent (la promo
 * ne filtre PAS ici : elle ne sert qu a departager, cf. promoMatches). La
 * comparaison se fait en JS (SQLite ne retire pas les accents).
 */
export function findUnlinkedCandidatesByName(
  lastName: string,
  firstName: string,
): MatchCandidate[] {
  const database = getDatabase();
  const rows = database
    .prepare(
      "SELECT id, first_name, last_name, level FROM people WHERE auth_sub IS NULL",
    )
    .all() as {
    id: string;
    first_name: string;
    last_name: string;
    level: number | null;
  }[];

  const nLast = normalizeName(lastName);
  const nFirst = normalizeName(firstName);
  return rows
    .filter(
      (r) =>
        normalizeName(r.last_name) === nLast &&
        normalizeName(r.first_name) === nFirst,
    )
    .map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      level: r.level,
    }));
}

/**
 * Unlinked people whose last+first name RESEMBLE the given identity (edit
 * distance <= maxDistance, last/first inversion tolerated), sorted nearest
 * first. Used as a fallback when no exact match exists, to recover from a typo
 * between the SSO and the database without ever auto-linking (the user confirms
 * via /auth/link).
 */
export function findUnlinkedFuzzyByName(
  lastName: string,
  firstName: string,
  maxDistance: number = NAME_MATCH_MAX_DISTANCE,
): MatchCandidate[] {
  const database = getDatabase();
  const rows = database
    .prepare(
      "SELECT id, first_name, last_name, level FROM people WHERE auth_sub IS NULL",
    )
    .all() as {
    id: string;
    first_name: string;
    last_name: string;
    level: number | null;
  }[];

  return rows
    .map((r) => ({
      row: r,
      distance: nameDistance(lastName, firstName, r.last_name, r.first_name),
    }))
    .filter((c) => c.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8)
    .map((c) => ({
      id: c.row.id,
      firstName: c.row.first_name,
      lastName: c.row.last_name,
      level: c.row.level,
    }));
}

/**
 * Fiches to offer on the linking screen: the exact matches when they exist,
 * otherwise a fallback on resemblances (typos / inversion). Single source of
 * truth shared by the callback (which decides to show the screen) and the screen
 * itself (load + choice validation), so they never diverge.
 */
export function getLinkCandidates(
  lastName: string,
  firstName: string,
): MatchCandidate[] {
  const exact = findUnlinkedCandidatesByName(lastName, firstName);
  return exact.length > 0
    ? exact
    : findUnlinkedFuzzyByName(lastName, firstName);
}

/**
 * Vrai si la promo SSO (annee d entree) colle a la fiche. Le `level` stocke est
 * l annee de DIPLOME ; un ICM entre en `promo` sort en `promo + 3`. On tolere
 * aussi l egalite stricte (donnees saisies en annee d entree).
 */
function promoMatches(level: number | null, promo: number | null): boolean {
  if (level === null || promo === null) {
    return false;
  }
  return level === promo || level === promo + 3;
}

/**
 * Link an existing fiche to an Authentik account and overwrite its identity
 * fields with the SSO values (MiConnect is source of truth: name/first
 * name/promo/email/formation are replaced whenever a value is provided, never
 * wiped when absent).
 */
export function linkPersonAuth(id: string, identity: OidcIdentity): void {
  const database = getDatabase();
  database
    .prepare(
      `UPDATE people SET
        auth_sub = ?,
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        level = COALESCE(?, level),
        email = COALESCE(?, email),
        formation = COALESCE(?, formation),
        role = ?,
        last_login = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    )
    .run(
      identity.sub,
      identity.firstName || null,
      identity.lastName || null,
      identity.level,
      identity.email,
      identity.formation,
      identity.role,
      nowEpoch(),
      id,
    );
}

/** Rafraichit les champs d identite d une fiche deja liee (a chaque login SSO). */
export function refreshPersonIdentity(
  id: string,
  identity: OidcIdentity,
): void {
  const database = getDatabase();
  database
    .prepare(
      `UPDATE people SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        level = COALESCE(?, level),
        email = COALESCE(?, email),
        formation = COALESCE(?, formation),
        role = ?,
        last_login = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    )
    .run(
      identity.firstName || null,
      identity.lastName || null,
      identity.level,
      identity.email,
      identity.formation,
      identity.role,
      nowEpoch(),
      id,
    );
}

/** Cree une nouvelle fiche people deja liee au compte Authentik. */
export function createAuthedPerson(identity: OidcIdentity): string {
  const database = getDatabase();
  database
    .prepare(
      `INSERT INTO people
        (id, first_name, last_name, level, image_url, auth_sub, email, formation, role, last_login)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      identity.sub,
      identity.firstName,
      identity.lastName,
      identity.level,
      "default.jpg",
      identity.sub,
      identity.email,
      identity.formation,
      identity.role,
      nowEpoch(),
    );
  return identity.sub;
}

/**
 * Result of resolving a login. `created` is true when a brand-new account fiche
 * was inserted (id = sub), so the caller can trigger a positions recompute to
 * place the new star on the map.
 */
export type LoginResolution =
  | { kind: "linked"; personId: string; created: boolean }
  | { kind: "choice"; candidates: MatchCandidate[] };

/**
 * Resout un login Authentik :
 *   1. sub already linked -> refresh, link.
 *   2. 1 exact (last/first) candidate + matching promo -> auto-link.
 *   3. several exact candidates / doubt -> "choice" (selection screen).
 *   4. no exact candidate but FUZZY candidates (typo/inversion) -> "choice" for
 *      confirmation (never auto-link on a mere resemblance).
 *   5. no candidate at all -> create an account fiche (id = sub).
 */
export function resolveLogin(identity: OidcIdentity): LoginResolution {
  const existing = getPersonIdByAuthSub(identity.sub);
  if (existing) {
    refreshPersonIdentity(existing, identity);
    return { kind: "linked", personId: existing, created: false };
  }

  const candidates = findUnlinkedCandidatesByName(
    identity.lastName,
    identity.firstName,
  );
  const confident = candidates.filter((c) =>
    promoMatches(c.level, identity.level),
  );
  if (confident.length === 1) {
    linkPersonAuth(confident[0].id, identity);
    return { kind: "linked", personId: confident[0].id, created: false };
  }
  if (candidates.length > 0) {
    return { kind: "choice", candidates };
  }

  // No exact match: offer the RESEMBLING fiches (typo/inversion) for
  // confirmation instead of creating a duplicate.
  const fuzzy = findUnlinkedFuzzyByName(identity.lastName, identity.firstName);
  if (fuzzy.length > 0) {
    console.debug(
      `[Login] ${fuzzy.length} fuzzy candidate(s) for ${identity.sub} (${identity.lastName} ${identity.firstName})`,
    );
    return { kind: "choice", candidates: fuzzy };
  }

  return {
    kind: "linked",
    personId: createAuthedPerson(identity),
    created: true,
  };
}

/** auth_sub d une fiche (cle photo MiGallery), sinon null. */
export function getPersonAuthSub(id: string): string | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT auth_sub FROM people WHERE id = ?")
    .get(id) as { auth_sub: string | null } | undefined;
  return row?.auth_sub ?? null;
}

/**
 * Role stocke en base pour un compte Authentik, sinon null (sub non lie). Permet
 * au login de ne jamais retrograder un admin promu en base : l env SKY_ADMIN_SUBS
 * ne fait qu amorcer (bootstrap), la base reste la source de verite.
 */
export function getPersonRoleByAuthSub(authSub: string): string | null {
  const row = getDatabase()
    .prepare("SELECT role FROM people WHERE auth_sub = ?")
    .get(authSub) as { role: string } | undefined;
  return row?.role ?? null;
}

/** Definit le role d une fiche (gestion des admins, source de verite en base). */
export function setPersonRole(id: string, role: "user" | "admin"): boolean {
  console.debug(`[Admin] setPersonRole id=${id} role=${role}`);
  return (
    getDatabase()
      .prepare(
        "UPDATE people SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .run(role, id).changes > 0
  );
}

/**
 * Delie une fiche de son compte Authentik : la fiche redevient un placeholder
 * (auth_sub NULL, role 'user') et ses sessions sont revoquees. Le graphe et les
 * liens de parrainage sont conserves.
 */
export function unlinkPersonAuth(id: string): boolean {
  console.debug(`[Admin] unlinkPersonAuth id=${id}`);
  const database = getDatabase();
  const tx = database.transaction(() => {
    database.prepare("DELETE FROM sessions WHERE person_id = ?").run(id);
    return database
      .prepare(
        `UPDATE people SET auth_sub = NULL, role = 'user',
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .run(id);
  });
  return tx().changes > 0;
}

/**
 * Self-service correction: move the signed-in user's account from its current
 * fiche to ANOTHER unlinked fiche (recovering from a wrong auto-link or a
 * homonym). The old fiche becomes a placeholder again WITHOUT losing its graph;
 * the target fiche inherits the account identity (sub, name, promo, role) and the
 * current session token is repointed so the user stays logged in. Returns false
 * if the current fiche is not linked, or the target is the same/missing/already
 * linked.
 */
export function relinkSelf(
  currentId: string,
  targetId: string,
  sessionToken: string,
): boolean {
  if (currentId === targetId) {
    return false;
  }
  console.debug(`[Account] relinkSelf ${currentId} -> ${targetId}`);
  const database = getDatabase();
  return database.transaction(() => {
    const current = database
      .prepare(
        `SELECT auth_sub, first_name, last_name, level, email, formation, role
         FROM people WHERE id = ?`,
      )
      .get(currentId) as
      | {
          auth_sub: string | null;
          first_name: string;
          last_name: string;
          level: number | null;
          email: string | null;
          formation: string | null;
          role: string;
        }
      | undefined;
    if (!current || current.auth_sub === null) {
      return false;
    }
    const target = database
      .prepare("SELECT auth_sub FROM people WHERE id = ?")
      .get(targetId) as { auth_sub: string | null } | undefined;
    if (!target || target.auth_sub !== null) {
      return false;
    }

    // Detach the old fiche first (auth_sub is UNIQUE: free the value before
    // reassigning it to the target), keeping its graph edges.
    database
      .prepare(
        `UPDATE people SET auth_sub = NULL, role = 'user',
           updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .run(currentId);

    // The target inherits the account identity (SSO is source of truth for name/promo).
    database
      .prepare(
        `UPDATE people SET
           auth_sub = ?, first_name = ?, last_name = ?, level = ?,
           email = ?, formation = ?, role = ?, last_login = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(
        current.auth_sub,
        current.first_name,
        current.last_name,
        current.level,
        current.email,
        current.formation,
        current.role,
        nowEpoch(),
        targetId,
      );

    // Repoint the active session so the user stays logged in on the new fiche.
    database
      .prepare("UPDATE sessions SET person_id = ? WHERE token = ?")
      .run(targetId, sessionToken);
    return true;
  })();
}

/**
 * Unlinked fiches (placeholders), for the self-service correction screen where
 * the user picks the fiche to attach their account to. Sorted by name for
 * tolerant client-side filtering.
 */
export function getUnlinkedPeople(): {
  id: string;
  prenom: string;
  nom: string;
  level: number | null;
}[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, first_name, last_name, level FROM people
       WHERE auth_sub IS NULL ORDER BY last_name, first_name`,
    )
    .all() as {
    id: string;
    first_name: string;
    last_name: string;
    level: number | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    prenom: r.first_name,
    nom: r.last_name,
    level: r.level,
  }));
}

/** Fiche enrichie pour l administration (role + etat de liaison du compte). */
export interface AdminPersonRow {
  id: string;
  prenom: string;
  nom: string;
  level: number | null;
  role: string;
  linked: boolean;
  auth_sub: string | null;
  email: string | null;
  formation: string | null;
}

/** Toutes les fiches avec leurs metadonnees admin (role, liaison, formation). */
export function getAllPeopleAdmin(): AdminPersonRow[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, first_name, last_name, level, role, auth_sub, email, formation
       FROM people ORDER BY last_name, first_name`,
    )
    .all() as {
    id: string;
    first_name: string;
    last_name: string;
    level: number | null;
    role: string;
    auth_sub: string | null;
    email: string | null;
    formation: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    prenom: r.first_name,
    nom: r.last_name,
    level: r.level,
    role: r.role,
    linked: r.auth_sub !== null,
    auth_sub: r.auth_sub,
    email: r.email,
    formation: r.formation,
  }));
}

/** Cree une session opaque (7 jours) pour une fiche people. */
export function createSession(personId: string): {
  token: string;
  expiresAt: number;
} {
  const database = getDatabase();
  const token = randomUUID();
  const expiresAt = nowEpoch() + SESSION_TTL_SECONDS;
  database
    .prepare(
      "INSERT INTO sessions (token, person_id, expires_at) VALUES (?, ?, ?)",
    )
    .run(token, personId, expiresAt);
  return { token, expiresAt };
}

/** Resout la fiche people d une session valide (non expiree), sinon null. */
export function getSessionPerson(token: string): SessionPerson | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT p.id, p.first_name, p.last_name, p.level, p.image_url,
              p.auth_sub, p.email, p.formation, p.role
       FROM sessions s
       JOIN people p ON p.id = s.person_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, nowEpoch()) as
    | {
        id: string;
        first_name: string;
        last_name: string;
        level: number | null;
        image_url: string | null;
        auth_sub: string | null;
        email: string | null;
        formation: string | null;
        role: string;
      }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    prenom: row.first_name,
    nom: row.last_name,
    level: row.level,
    image: row.image_url,
    auth_sub: row.auth_sub,
    email: row.email,
    formation: row.formation,
    role: row.role,
  };
}

/** Supprime une session (logout). */
export function deleteSession(token: string): void {
  getDatabase().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/** Purge les sessions expirees (appele opportunement au login). */
export function deleteExpiredSessions(): void {
  getDatabase()
    .prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .run(nowEpoch());
}

// ============================================
// PENDING LINKS (ecran de choix au login)
// ============================================

const PENDING_TTL_SECONDS = 60 * 15; // 15 minutes

/**
 * Stocke une identite SSO en attente de choix de liaison (cas ambigu). Le token
 * opaque est pose en cookie ; l identite (sub verifie) reste cote serveur pour
 * eviter toute falsification du choix.
 */
export function createPendingLink(identity: OidcIdentity): string {
  const database = getDatabase();
  const token = randomUUID();
  database
    .prepare(
      `INSERT INTO pending_links
        (token, sub, first_name, last_name, level, email, formation, role, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      token,
      identity.sub,
      identity.firstName,
      identity.lastName,
      identity.level,
      identity.email,
      identity.formation,
      identity.role,
      nowEpoch() + PENDING_TTL_SECONDS,
    );
  return token;
}

/** Recupere l identite en attente (non expiree) pour un token, sinon null. */
export function getPendingLink(token: string): OidcIdentity | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT sub, first_name, last_name, level, email, formation, role
       FROM pending_links WHERE token = ? AND expires_at > ?`,
    )
    .get(token, nowEpoch()) as
    | {
        sub: string;
        first_name: string;
        last_name: string;
        level: number | null;
        email: string | null;
        formation: string | null;
        role: string;
      }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    sub: row.sub,
    firstName: row.first_name,
    lastName: row.last_name,
    level: row.level,
    email: row.email,
    formation: row.formation,
    role: row.role,
  };
}

/** Supprime une demande de liaison (apres resolution ou expiration). */
export function deletePendingLink(token: string): void {
  getDatabase().prepare("DELETE FROM pending_links WHERE token = ?").run(token);
}

/** Purge les demandes de liaison expirees. */
export function deleteExpiredPendingLinks(): void {
  getDatabase()
    .prepare("DELETE FROM pending_links WHERE expires_at <= ?")
    .run(nowEpoch());
}

// ============================================
// ID GENERATION
// ============================================

/** Normalise un fragment de nom pour un id : minuscule, sans accents, alphanum. */
function slugPart(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Genere un id `prenom.nom` unique pour une fiche placeholder. En cas de
 * collision : ajoute `.promo` puis `.idx`. L id est stable (ne change jamais
 * apres creation). Distinct des id de comptes crees ex nihilo (= sub Authentik).
 */
export function generatePersonId(
  firstName: string,
  lastName: string,
  level: number | null,
): string {
  const database = getDatabase();
  const exists = (id: string): boolean =>
    database.prepare("SELECT 1 FROM people WHERE id = ?").get(id) !== undefined;

  const base =
    `${slugPart(firstName)}.${slugPart(lastName)}`.replace(/^\.|\.$/g, "") ||
    "anonyme";
  if (!exists(base)) {
    return base;
  }
  const stem = level !== null ? `${base}.${level}` : base;
  if (level !== null && !exists(stem)) {
    return stem;
  }
  let idx = 2;
  while (exists(`${stem}.${idx}`)) {
    idx += 1;
  }
  return `${stem}.${idx}`;
}

// ============================================
// LEGACY DB (lecture seule, fenetre /admin/legacy)
// ============================================

const LEGACY_DB_PATH = path.join(process.cwd(), "database", "sky-legacy.db");
let legacyDb: Database.Database | null = null;

/** Vrai si le snapshot legacy (ancienne base figee) existe. */
export function legacyExists(): boolean {
  return fs.existsSync(LEGACY_DB_PATH);
}

/** Ouvre (lazy) la base legacy en lecture seule, sinon null. */
function getLegacyDatabase(): Database.Database | null {
  if (!legacyExists()) {
    return null;
  }
  if (!legacyDb) {
    legacyDb = new Database(LEGACY_DB_PATH, { readonly: true });
  }
  return legacyDb;
}

/** Fiche de l ancienne base (schema v3 : pas de SSO). */
export interface LegacyPerson {
  id: string;
  first_name: string;
  last_name: string;
  level: number | null;
  bio: string | null;
  image_url: string | null;
}

/** Compte des entites de l ancienne base. */
export function getLegacyCounts(): {
  people: number;
  relationships: number;
  links: number;
} {
  const ldb = getLegacyDatabase();
  if (!ldb) {
    return { people: 0, relationships: 0, links: 0 };
  }
  const count = (sql: string): number => {
    try {
      return (ldb.prepare(sql).get() as { c: number }).c;
    } catch {
      return 0;
    }
  };
  return {
    people: count("SELECT count(*) c FROM people"),
    relationships: count("SELECT count(*) c FROM relationships"),
    links: count("SELECT count(*) c FROM external_links"),
  };
}

/** Recherche dans l ancienne base (nom, prenom, id, promo). */
export function getLegacyPeople(search: string, limit = 200): LegacyPerson[] {
  const ldb = getLegacyDatabase();
  if (!ldb) {
    return [];
  }
  const q = search.trim().toLowerCase();
  const rows = q
    ? (ldb
        .prepare(
          `SELECT id, first_name, last_name, level, bio, image_url FROM people
           WHERE lower(first_name) LIKE ? OR lower(last_name) LIKE ?
              OR lower(id) LIKE ? OR CAST(level AS TEXT) LIKE ?
           ORDER BY last_name, first_name LIMIT ?`,
        )
        .all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit) as LegacyPerson[])
    : (ldb
        .prepare(
          `SELECT id, first_name, last_name, level, bio, image_url FROM people
           ORDER BY last_name, first_name LIMIT ?`,
        )
        .all(limit) as LegacyPerson[]);
  return rows;
}

/** Relations (parrains entrants, fillots sortants) d une fiche legacy. */
export function getLegacyPersonRelations(id: string): {
  parrains: { id: string; name: string; type: string }[];
  fillots: { id: string; name: string; type: string }[];
} {
  const ldb = getLegacyDatabase();
  if (!ldb) {
    return { parrains: [], fillots: [] };
  }
  // source = parrain -> target = fillot. Parrains de P : target_id = P.
  const parrains = ldb
    .prepare(
      `SELECT p.id, p.last_name || ' ' || p.first_name AS name, r.type
       FROM relationships r JOIN people p ON p.id = r.source_id
       WHERE r.target_id = ? ORDER BY r.type`,
    )
    .all(id) as { id: string; name: string; type: string }[];
  const fillots = ldb
    .prepare(
      `SELECT p.id, p.last_name || ' ' || p.first_name AS name, r.type
       FROM relationships r JOIN people p ON p.id = r.target_id
       WHERE r.source_id = ? ORDER BY r.type`,
    )
    .all(id) as { id: string; name: string; type: string }[];
  return { parrains, fillots };
}

// ============================================
// RELATIONSHIPS OPERATIONS
// ============================================

export function getAllRelationships(): JsonRelation[] {
  const database = getDatabase();
  const stmt = database.prepare(`
		SELECT source_id, target_id, type
		FROM relationships
		ORDER BY id
	`);

  const rows = stmt.all() as {
    source_id: string;
    target_id: string;
    type: string;
  }[];
  return rows.map((row) => ({
    source: row.source_id,
    target: row.target_id,
    type: row.type,
  }));
}

export function createRelationship(relationship: JsonRelation): boolean {
  const database = getDatabase();
  const stmt = database.prepare(`
		INSERT INTO relationships (source_id, target_id, type)
		VALUES (?, ?, ?)
	`);

  try {
    stmt.run(relationship.source, relationship.target, relationship.type);
    return true;
  } catch (error) {
    console.error("Create relationship error:", error);
    return false;
  }
}

export function deleteRelationship(
  source: string,
  target: string,
  type?: string,
): boolean {
  const database = getDatabase();
  let query = "DELETE FROM relationships WHERE source_id = ? AND target_id = ?";
  const params: string[] = [source, target];

  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  const stmt = database.prepare(query);
  const result = stmt.run(...params);
  return result.changes > 0;
}

// ============================================
// ENTOURAGE / CONTRAINTES DE PARENTE
// ============================================

/** Type de lien de parrainage : officiel ou par adoption. */
export type RelationKind = "parrainage" | "adoption";

/** Vrai si la valeur est un type de lien connu. */
export function isRelationKind(value: unknown): value is RelationKind {
  return value === "parrainage" || value === "adoption";
}

/**
 * Maxima d ascendants (parrains/marraines) par personne et par type. Une
 * personne a au plus 1 parrain officiel et 1 parrain d adoption.
 */
export const MAX_PARRAINS: Record<RelationKind, number> = {
  parrainage: 1,
  adoption: 1,
};

/**
 * Maxima de descendants (fillots/fillotes) par personne et par type. Une
 * personne a au plus 3 fillots officiels et 2 fillots d adoption.
 */
export const MAX_FILLOTS: Record<RelationKind, number> = {
  parrainage: 3,
  adoption: 2,
};

/** Code machine d une violation de regle de parrainage. */
export type RelationErrorCode =
  | "INVALID_KIND"
  | "SELF"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "MAX_PARRAIN"
  | "MAX_FILLOT"
  | "CYCLE";

/**
 * Erreur metier d un lien de parrainage refuse (regles 1/1/3/2, cycle, doublon).
 * Le `message` est en francais, pret a etre affiche a l utilisateur.
 */
export class RelationError extends Error {
  code: RelationErrorCode;
  constructor(code: RelationErrorCode, message: string) {
    super(message);
    this.name = "RelationError";
    this.code = code;
  }
}

/** Nombre de parrains d un type donne pointant vers `personId` (liens entrants). */
function countIncoming(personId: string, kind: RelationKind): number {
  const row = getDatabase()
    .prepare(
      "SELECT COUNT(*) AS c FROM relationships WHERE target_id = ? AND type = ?",
    )
    .get(personId, kind) as { c: number };
  return row.c;
}

/** Nombre de fillots d un type donne issus de `personId` (liens sortants). */
function countOutgoing(personId: string, kind: RelationKind): number {
  const row = getDatabase()
    .prepare(
      "SELECT COUNT(*) AS c FROM relationships WHERE source_id = ? AND type = ?",
    )
    .get(personId, kind) as { c: number };
  return row.c;
}

/** Vrai s il existe deja un lien (quel que soit le type) de source vers target. */
function edgeExists(sourceId: string, targetId: string): boolean {
  return (
    getDatabase()
      .prepare(
        "SELECT 1 FROM relationships WHERE source_id = ? AND target_id = ?",
      )
      .get(sourceId, targetId) !== undefined
  );
}

/** Vrai si une fiche existe. */
function personExists(id: string): boolean {
  return (
    getDatabase().prepare("SELECT 1 FROM people WHERE id = ?").get(id) !==
    undefined
  );
}

/**
 * Vrai si `toId` est atteignable depuis `fromId` en suivant les liens
 * parrain -> fillot (source -> target). Sert a detecter les cycles : ajouter
 * source -> target creerait un cycle si target peut deja atteindre source.
 */
function canReach(fromId: string, toId: string): boolean {
  const database = getDatabase();
  const stmt = database.prepare(
    "SELECT target_id FROM relationships WHERE source_id = ?",
  );
  const visited = new Set<string>();
  const queue: string[] = [fromId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === toId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const rows = stmt.all(current) as { target_id: string }[];
    for (const r of rows) {
      if (!visited.has(r.target_id)) {
        queue.push(r.target_id);
      }
    }
  }
  return false;
}

/**
 * Cree un lien de parrainage `sourceId` (parrain) -> `targetId` (fillot) du type
 * donne, en appliquant toutes les regles : pas d auto-lien, fiches existantes,
 * pas de doublon, maxima 1/1/3/2, pas de cycle. Leve `RelationError` sinon.
 */
export function addParrainage(
  sourceId: string,
  targetId: string,
  kind: RelationKind,
): void {
  console.debug(
    `[Entourage] addParrainage source=${sourceId} target=${targetId} kind=${kind}`,
  );
  if (!isRelationKind(kind)) {
    throw new RelationError("INVALID_KIND", "Type de lien invalide.");
  }
  if (sourceId === targetId) {
    throw new RelationError(
      "SELF",
      "Une personne ne peut pas se parrainer elle-meme.",
    );
  }
  if (!personExists(sourceId) || !personExists(targetId)) {
    throw new RelationError("NOT_FOUND", "Personne introuvable.");
  }
  if (edgeExists(sourceId, targetId)) {
    throw new RelationError("DUPLICATE", "Ce lien existe deja.");
  }
  if (countOutgoing(sourceId, kind) >= MAX_FILLOTS[kind]) {
    throw new RelationError(
      "MAX_FILLOT",
      kind === "parrainage"
        ? "Limite de 3 fillots officiels atteinte."
        : "Limite de 2 fillots d'adoption atteinte.",
    );
  }
  if (countIncoming(targetId, kind) >= MAX_PARRAINS[kind]) {
    throw new RelationError(
      "MAX_PARRAIN",
      kind === "parrainage"
        ? "Un parrain officiel existe deja."
        : "Un parrain d'adoption existe deja.",
    );
  }
  if (canReach(targetId, sourceId)) {
    throw new RelationError("CYCLE", "Ce lien creerait un cycle dans l'arbre.");
  }
  getDatabase()
    .prepare(
      "INSERT INTO relationships (source_id, target_id, type) VALUES (?, ?, ?)",
    )
    .run(sourceId, targetId, kind);
}

/** Lien de parrainage brut (ligne `relationships`), sinon null. */
export function getRelationshipById(id: number): {
  id: number;
  source_id: string;
  target_id: string;
  type: string;
} | null {
  const row = getDatabase()
    .prepare(
      "SELECT id, source_id, target_id, type FROM relationships WHERE id = ?",
    )
    .get(id) as
    | { id: number; source_id: string; target_id: string; type: string }
    | undefined;
  return row ?? null;
}

/** Supprime un lien de parrainage par son id. Vrai si une ligne a ete retiree. */
export function removeRelationshipById(id: number): boolean {
  return (
    getDatabase().prepare("DELETE FROM relationships WHERE id = ?").run(id)
      .changes > 0
  );
}

/** Un membre de l entourage (parrain ou fillot) d une personne. */
export interface EntourageMember {
  relId: number;
  kind: RelationKind;
  id: string;
  prenom: string;
  nom: string;
  level: number | null;
}

/** Entourage direct d une personne : parrains entrants, fillots sortants. */
export interface Entourage {
  parrains: EntourageMember[];
  fillots: EntourageMember[];
}

/** Ligne brute d une jointure relationship + people. */
interface EntourageRow {
  relId: number;
  type: string;
  id: string;
  first_name: string;
  last_name: string;
  level: number | null;
}

function toMember(row: EntourageRow): EntourageMember {
  return {
    relId: row.relId,
    kind: row.type === "adoption" ? "adoption" : "parrainage",
    id: row.id,
    prenom: row.first_name,
    nom: row.last_name,
    level: row.level,
  };
}

/**
 * Entourage direct d une personne. `parrains` = liens entrants (source = parrain),
 * `fillots` = liens sortants (target = fillot).
 */
export function getEntourage(personId: string): Entourage {
  const database = getDatabase();
  const parrains = (
    database
      .prepare(
        `SELECT r.id AS relId, r.type, p.id, p.first_name, p.last_name, p.level
         FROM relationships r JOIN people p ON p.id = r.source_id
         WHERE r.target_id = ? ORDER BY r.type, p.last_name`,
      )
      .all(personId) as EntourageRow[]
  ).map(toMember);
  const fillots = (
    database
      .prepare(
        `SELECT r.id AS relId, r.type, p.id, p.first_name, p.last_name, p.level
         FROM relationships r JOIN people p ON p.id = r.target_id
         WHERE r.source_id = ? ORDER BY r.type, p.last_name`,
      )
      .all(personId) as EntourageRow[]
  ).map(toMember);
  return { parrains, fillots };
}

/** Membre d entourage expose a une app externe (Canari) : keye par sub. */
export interface ExternalEntourageMember {
  prenom: string;
  nom: string;
  level: number | null;
  kind: RelationKind;
  sub: string | null; // sub Authentik du membre (pour lier vers son profil Canari)
}

/** Entourage (parrains/fillots) d une personne, keye par son sub Authentik. */
export interface ExternalEntourage {
  found: boolean;
  parrains: ExternalEntourageMember[];
  fillots: ExternalEntourageMember[];
}

interface ExternalRow {
  type: string;
  first_name: string;
  last_name: string;
  level: number | null;
  auth_sub: string | null;
}

function toExternalMember(row: ExternalRow): ExternalEntourageMember {
  return {
    prenom: row.first_name,
    nom: row.last_name,
    level: row.level,
    kind: row.type === "adoption" ? "adoption" : "parrainage",
    sub: row.auth_sub,
  };
}

/**
 * Entourage d une personne resolue par son sub Authentik (= cle commune avec
 * Canari). Renvoie `found: false` si aucune fiche n est liee a ce sub. Chaque
 * membre porte son propre sub pour permettre a Canari de lier vers son profil.
 */
export function getEntourageBySub(sub: string): ExternalEntourage {
  const database = getDatabase();
  const person = database
    .prepare("SELECT id FROM people WHERE auth_sub = ?")
    .get(sub) as { id: string } | undefined;
  if (!person) {
    return { found: false, parrains: [], fillots: [] };
  }
  const parrains = (
    database
      .prepare(
        `SELECT r.type, p.first_name, p.last_name, p.level, p.auth_sub
         FROM relationships r JOIN people p ON p.id = r.source_id
         WHERE r.target_id = ? ORDER BY r.type, p.last_name`,
      )
      .all(person.id) as ExternalRow[]
  ).map(toExternalMember);
  const fillots = (
    database
      .prepare(
        `SELECT r.type, p.first_name, p.last_name, p.level, p.auth_sub
         FROM relationships r JOIN people p ON p.id = r.target_id
         WHERE r.source_id = ? ORDER BY r.type, p.last_name`,
      )
      .all(person.id) as ExternalRow[]
  ).map(toExternalMember);
  return { found: true, parrains, fillots };
}

/** Fiche homonyme proposee comme candidate de liaison (dedup a la creation). */
export interface NamesakeCandidate {
  id: string;
  firstName: string;
  lastName: string;
  level: number | null;
  linked: boolean;
}

/**
 * Fiches dont le nom+prenom normalises correspondent, liees ou non (dedup a la
 * creation d un membre d entourage : on propose de relier plutot que dupliquer).
 */
export function findPeopleByName(
  lastName: string,
  firstName: string,
): NamesakeCandidate[] {
  const rows = getDatabase()
    .prepare("SELECT id, first_name, last_name, level, auth_sub FROM people")
    .all() as {
    id: string;
    first_name: string;
    last_name: string;
    level: number | null;
    auth_sub: string | null;
  }[];
  const nLast = normalizeName(lastName);
  const nFirst = normalizeName(firstName);
  return rows
    .filter(
      (r) =>
        normalizeName(r.last_name) === nLast &&
        normalizeName(r.first_name) === nFirst,
    )
    .map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      level: r.level,
      linked: r.auth_sub !== null,
    }));
}

/**
 * Cree une fiche placeholder (sans compte) pour un membre d entourage. L id est
 * genere en `prenom.nom[.promo][.idx]`. `createdBy` trace l auteur de la fiche.
 */
export function createPlaceholderPerson(
  firstName: string,
  lastName: string,
  level: number | null,
  createdBy: string,
): string {
  // Enforce the display convention at creation: "NOM" uppercase, "Prenom" capitalized.
  const nom = formatLastName(lastName);
  const prenom = formatFirstName(firstName);
  const id = generatePersonId(prenom, nom, level);
  console.debug(`[Entourage] createPlaceholderPerson id=${id} by=${createdBy}`);
  getDatabase()
    .prepare(
      `INSERT INTO people (id, first_name, last_name, level, image_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, prenom, nom, level, "default.jpg", createdBy);
  return id;
}

// ============================================
// GRAPH DATA EXPORT (for GraphCanvas)
// ============================================

export function exportGraphData(): GraphDataFile {
  const people = getAllPeople();
  const relationships = getAllRelationships();

  const peopleMap: Record<string, Person> = {};
  for (const person of people) {
    peopleMap[person.id] = person;
  }

  return {
    people: peopleMap,
    relationships,
  };
}

// ============================================
// ADDITIONAL HELPER FUNCTIONS
// ============================================

// Alias for getPersonById
export function getPerson(id: string): Person | null {
  return getPersonById(id);
}

// ============================================
// POSITIONS CALCULATION
// ============================================

/** Outcome of the last positions recompute, so failures are observable. */
export interface PositionsStatus {
  ok: boolean;
  at: number; // epoch seconds
  positioned: number; // nodes written to positions.json
  total: number; // people in the database
  error: string | null; // failure detail
}

let lastPositionsStatus: PositionsStatus | null = null;

/** Last positions recompute status (null if none ran in this process yet). */
export function getPositionsStatus(): PositionsStatus | null {
  return lastPositionsStatus;
}

/**
 * Recompute the star-map positions in-process (TypeScript ForceAtlas2 layout,
 * see `positions.ts`) and write them to database/positions.json, recording the
 * outcome in `lastPositionsStatus` so callers and the admin dashboard can tell
 * whether it worked. Rejects with a detailed Error on failure instead of failing
 * silently: the map shows only positioned nodes, so a swallowed error hides
 * people. Kept async for call-site compatibility even though the work is sync.
 */
export function recalculatePositions(): Promise<PositionsStatus> {
  const database = getDatabase();

  const record = (
    ok: boolean,
    error: string | null,
    positioned: number,
    total: number,
  ): PositionsStatus => {
    lastPositionsStatus = { ok, at: nowEpoch(), positioned, total, error };
    return lastPositionsStatus;
  };

  try {
    const nodeIds = (
      database.prepare("SELECT id FROM people").all() as { id: string }[]
    ).map((r) => r.id);
    const nodeSet = new Set(nodeIds);
    const edgeRows = database
      .prepare("SELECT source_id, target_id FROM relationships")
      .all() as { source_id: string; target_id: string }[];
    const edges: [string, string][] = [];
    for (const e of edgeRows) {
      if (nodeSet.has(e.source_id) && nodeSet.has(e.target_id)) {
        edges.push([e.source_id, e.target_id]);
      }
    }

    console.debug(
      `[Positions] Computing layout for ${nodeIds.length} people, ${edges.length} links...`,
    );
    const positions = layoutGraph(nodeIds, edges);

    const file = path.join(process.cwd(), "database", "positions.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(positions, null, 2));

    const status = record(true, null, Object.keys(positions).length, nodeIds.length);
    console.debug(
      `[Positions] Done: ${status.positioned}/${status.total} nodes positioned`,
    );
    return Promise.resolve(status);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[Positions] Layout failed: ${message}`);
    let total = 0;
    try {
      total = (
        database.prepare("SELECT COUNT(*) AS n FROM people").get() as {
          n: number;
        }
      ).n;
    } catch (countError) {
      console.error("[Positions] people count failed:", countError);
    }
    return Promise.reject(
      Object.assign(new Error(message), {
        status: record(false, message, 0, total),
      }),
    );
  }
}
