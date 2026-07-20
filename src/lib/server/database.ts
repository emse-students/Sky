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
  personMatchScore,
} from "$utils/format";
import { layoutGraph } from "$server/positions";
import { m } from "$lib/paraglide/messages";

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

    // Merge suggestions the admin chose to ignore (canonical a_id < b_id).
    // Created lazily here so no separate migration is required.
    db.exec(
      `CREATE TABLE IF NOT EXISTS ignored_merge_pairs (
         a_id TEXT NOT NULL,
         b_id TEXT NOT NULL,
         PRIMARY KEY (a_id, b_id)
       )`,
    );
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

/**
 * Search people by free text. A 4-digit query matches a promotion year;
 * otherwise a tolerant in-memory scan ranks people by name (substring,
 * nom/prenom inversion and typo edit-distance via personMatchScore). The scan
 * replaces the former FTS5 MATCH, which returned nothing whenever the FTS index
 * was stale/unpopulated (e.g. after a database rebuild) - the source of the
 * add-a-relative search always coming back empty.
 */
export function searchPeople(query: string): Person[] {
  const database = getDatabase();
  const q = query.trim();

  // Year query (4 digits) -> match by promotion.
  if (/^\d{4}$/.test(q)) {
    const rows = database
      .prepare("SELECT id FROM people WHERE level = ? LIMIT 50")
      .all(parseInt(q)) as { id: string }[];
    return rows
      .map((row) => getPersonById(row.id))
      .filter((p): p is Person => p !== null);
  }

  const rows = database
    .prepare("SELECT id, first_name, last_name, level FROM people")
    .all() as {
    id: string;
    first_name: string;
    last_name: string;
    level: number | null;
  }[];

  return rows
    .map((r) => ({
      id: r.id,
      score: personMatchScore(r.last_name, r.first_name, r.level, q),
    }))
    .filter((c) => c.score !== null)
    .sort((a, b) => (a.score as number) - (b.score as number))
    .slice(0, 50)
    .map((c) => getPersonById(c.id))
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

/**
 * Merge `sourceId` into `targetId`: move every relation and external link onto
 * the survivor, then delete the source. When `survivorIdentity` is given, the
 * survivor's display identity (nom/prenom/promo) is overwritten with the chosen
 * values - this is how the admin keeps one fiche's data over the other when they
 * differ. The survivor's `id` is never changed (it is a stable PK referenced by
 * relations), only its display columns. Omit `survivorIdentity` to keep the
 * survivor's own values unchanged (silent survivor-wins).
 */
export function mergePeople(
  sourceId: string,
  targetId: string,
  survivorIdentity?: { prenom: string; nom: string; level: number | null },
): void {
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

    // 5. Apply the chosen identity to the survivor (only when resolving a
    // conflict). Re-format to keep the "NOM"/"Prenom" display convention.
    if (survivorIdentity) {
      database
        .prepare(
          "UPDATE people SET last_name = ?, first_name = ?, level = ? WHERE id = ?",
        )
        .run(
          formatLastName(survivorIdentity.nom),
          formatFirstName(survivorIdentity.prenom),
          survivorIdentity.level,
          targetId,
        );
    }
  })();
}

// ============================================
// AUTH IDENTITY & SESSIONS
// ============================================

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

/** Identity resolved from the Authentik SSO (claims). */
export interface OidcIdentity {
  sub: string;
  firstName: string;
  lastName: string;
  level: number | null;
  email: string | null;
  formation: string | null;
  role: string;
}

/** A `people` record resolved for a session (server-side locals.user). */
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

/** The `people` record already linked to this Authentik sub, else null. */
export function getPersonIdByAuthSub(authSub: string): string | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT id FROM people WHERE auth_sub = ?")
    .get(authSub) as { id: string } | undefined;
  return row?.id ?? null;
}

/** A record eligible for linking (same last/first name, not yet linked). */
export interface MatchCandidate {
  id: string;
  firstName: string;
  lastName: string;
  level: number | null;
}

/**
 * Unlinked `people` records whose normalized last+first name match (the promo
 * does NOT filter here: it only breaks ties, cf. promoMatches). The comparison
 * runs in JS because SQLite does not strip accents.
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
 * True if the SSO promo (entry year) matches the record. The stored `level` is
 * the GRADUATION year; an ICM entering in `promo` graduates in `promo + 3`.
 * Strict equality is also tolerated (data entered as the entry year).
 */
function promoMatches(level: number | null, promo: number | null): boolean {
  if (level === null || promo === null) {
    return false;
  }
  return level === promo || level === promo + 3;
}

/**
 * Link an existing record to an Authentik account and overwrite its identity
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

/** Refresh the identity fields of an already-linked record (on every SSO login). */
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

/** Create a new `people` record already linked to the Authentik account. */
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
 * Result of resolving a login. `created` is true when a brand-new account record
 * was inserted (id = sub), so the caller can trigger a positions recompute to
 * place the new star on the map.
 */
export type LoginResolution =
  | { kind: "linked"; personId: string; created: boolean }
  | { kind: "choice"; candidates: MatchCandidate[] };

/**
 * Resolve an Authentik login:
 *   1. sub already linked -> refresh, link.
 *   2. 1 exact (last/first) candidate + matching promo -> auto-link.
 *   3. several exact candidates / doubt -> "choice" (selection screen).
 *   4. no exact candidate but FUZZY candidates (typo/inversion) -> "choice" for
 *      confirmation (never auto-link on a mere resemblance).
 *   5. no candidate at all -> create an account record (id = sub).
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

  // No exact match: offer the RESEMBLING records (typo/inversion) for
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

/** A record's auth_sub (the MiGallery photo key), else null. */
export function getPersonAuthSub(id: string): string | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT auth_sub FROM people WHERE id = ?")
    .get(id) as { auth_sub: string | null } | undefined;
  return row?.auth_sub ?? null;
}

/**
 * Role stored in the database for an Authentik account, else null (sub not
 * linked). Lets login never demote an admin promoted in the DB: the
 * SKY_ADMIN_SUBS env only bootstraps; the database stays the source of truth.
 */
export function getPersonRoleByAuthSub(authSub: string): string | null {
  const row = getDatabase()
    .prepare("SELECT role FROM people WHERE auth_sub = ?")
    .get(authSub) as { role: string } | undefined;
  return row?.role ?? null;
}

/** Set a record's role (admin management; the database is the source of truth). */
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
 * Unlink a record from its Authentik account: the record becomes a placeholder
 * again (auth_sub NULL, role 'user') and its sessions are revoked. The graph and
 * the godparent links are kept.
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
 * record to ANOTHER unlinked record (recovering from a wrong auto-link or a
 * homonym). The old record becomes a placeholder again WITHOUT losing its graph;
 * the target record inherits the account identity (sub, name, promo, role) and the
 * current session token is repointed so the user stays logged in. Returns false
 * if the current record is not linked, or the target is the same/missing/already
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

    // Detach the old record first (auth_sub is UNIQUE: free the value before
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

    // Repoint the active session so the user stays logged in on the new record.
    database
      .prepare("UPDATE sessions SET person_id = ? WHERE token = ?")
      .run(targetId, sessionToken);
    return true;
  })();
}

/**
 * Unlinked records (placeholders), for the self-service correction screen where
 * the user picks the record to attach their account to. Sorted by name for
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

/** A record enriched for administration (role + account link state). */
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

/** All records with their admin metadata (role, link state, formation). */
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

/** Create an opaque session (7 days) for a `people` record. */
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

/** Resolve the `people` record of a valid (non-expired) session, else null. */
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

/** Delete a session (logout). */
export function deleteSession(token: string): void {
  getDatabase().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/** Purge expired sessions (called opportunistically at login). */
export function deleteExpiredSessions(): void {
  getDatabase()
    .prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .run(nowEpoch());
}

// ============================================
// PENDING LINKS (login disambiguation screen)
// ============================================

const PENDING_TTL_SECONDS = 60 * 15; // 15 minutes

/**
 * Store an SSO identity awaiting a link choice (ambiguous case). The opaque
 * token is set as a cookie; the identity (verified sub) stays server-side to
 * prevent tampering with the choice.
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

/** Fetch the pending (non-expired) identity for a token, else null. */
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

/** Delete a pending link request (after resolution or expiry). */
export function deletePendingLink(token: string): void {
  getDatabase().prepare("DELETE FROM pending_links WHERE token = ?").run(token);
}

/** Purge expired pending link requests. */
export function deleteExpiredPendingLinks(): void {
  getDatabase()
    .prepare("DELETE FROM pending_links WHERE expires_at <= ?")
    .run(nowEpoch());
}

// ============================================
// ID GENERATION
// ============================================

/** Normalize a name fragment for an id: lowercase, accent-free, alphanumeric. */
function slugPart(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Generate a unique `prenom.nom` id for a placeholder record. On collision:
 * append `.promo` then `.idx`. The id is stable (never changes after creation).
 * Distinct from account ids created from scratch (= the Authentik sub).
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

/** True if the legacy snapshot (frozen old database) exists. */
export function legacyExists(): boolean {
  return fs.existsSync(LEGACY_DB_PATH);
}

/** Lazily open the legacy database read-only, else null. */
function getLegacyDatabase(): Database.Database | null {
  if (!legacyExists()) {
    return null;
  }
  if (!legacyDb) {
    legacyDb = new Database(LEGACY_DB_PATH, { readonly: true });
  }
  return legacyDb;
}

/** A record from the old database (schema v3: no SSO). */
export interface LegacyPerson {
  id: string;
  first_name: string;
  last_name: string;
  level: number | null;
  bio: string | null;
  image_url: string | null;
}

/** Entity counts of the old database. */
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

/** Search the old database (last name, first name, id, class). */
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

/** Relations (incoming parrains, outgoing fillots) of a legacy record. */
export function getLegacyPersonRelations(id: string): {
  parrains: { id: string; name: string; type: string }[];
  fillots: { id: string; name: string; type: string }[];
} {
  const ldb = getLegacyDatabase();
  if (!ldb) {
    return { parrains: [], fillots: [] };
  }
  // source = parrain -> target = fillot. Parrains of P: target_id = P.
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
// ENTOURAGE / GODPARENT CONSTRAINTS
// ============================================

/** Godparent link type: official or adoption. */
export type RelationKind = "parrainage" | "adoption";

/** True if the value is a known link type. */
export function isRelationKind(value: unknown): value is RelationKind {
  return value === "parrainage" || value === "adoption";
}

/**
 * Maximum godparents (parrains/marraines) per person and per type. A person has
 * at most 1 official godparent and 1 adoption godparent.
 */
export const MAX_PARRAINS: Record<RelationKind, number> = {
  parrainage: 1,
  adoption: 1,
};

/**
 * Maximum godchildren (fillots/fillotes) per person and per type. A person has
 * at most 3 official godchildren and 2 adoption godchildren.
 */
export const MAX_FILLOTS: Record<RelationKind, number> = {
  parrainage: 3,
  adoption: 2,
};

/**
 * Earliest valid promotion year: the school (Ecole des Mines de Saint-Etienne)
 * was founded in 1816, so no promotion can predate it. Used to reject typos at
 * creation time.
 */
export const MIN_PROMO = 1816;

/**
 * Maximum promotion-year gap between a godparent and their godchild. A godchild
 * is always a strictly more recent promotion, at most this many years apart.
 */
export const MAX_PROMO_GAP = 3;

/**
 * True if a promotion year is acceptable as user input: either unknown (null) or
 * an integer not before the school's founding year ({@link MIN_PROMO}). The
 * required-ness of the field is enforced separately by the callers.
 */
export function isValidPromo(level: number | null): boolean {
  return level === null || (Number.isInteger(level) && level >= MIN_PROMO);
}

/**
 * Validate the promotions of a would-be godparent/godchild pair. Returns the
 * violated rule's code, or null when the pair is acceptable: both promos must be
 * known, the godchild ({@link fillotLevel}) must be a strictly more recent
 * promotion than the godparent ({@link parrainLevel}), and they must be at most
 * {@link MAX_PROMO_GAP} years apart. Applies to both link kinds.
 */
export function checkPromoPair(
  parrainLevel: number | null,
  fillotLevel: number | null,
): "PROMO_UNKNOWN" | "PROMO_ORDER" | "PROMO_GAP" | null {
  if (parrainLevel === null || fillotLevel === null) {
    return "PROMO_UNKNOWN";
  }
  if (fillotLevel <= parrainLevel) {
    return "PROMO_ORDER";
  }
  if (fillotLevel - parrainLevel > MAX_PROMO_GAP) {
    return "PROMO_GAP";
  }
  return null;
}

/** Machine code for a godparent-rule violation. */
export type RelationErrorCode =
  | "INVALID_KIND"
  | "SELF"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "MAX_PARRAIN"
  | "MAX_FILLOT"
  | "CYCLE"
  | "PROMO_UNKNOWN"
  | "PROMO_ORDER"
  | "PROMO_GAP";

/**
 * Business error for a rejected godparent link (rules 1/1/3/2, cycle,
 * duplicate). The `message` is a localized string, ready to show to the user.
 */
export class RelationError extends Error {
  code: RelationErrorCode;
  constructor(code: RelationErrorCode, message: string) {
    super(message);
    this.name = "RelationError";
    this.code = code;
  }
}

/** Number of godparents of a given type pointing at `personId` (incoming links). */
function countIncoming(personId: string, kind: RelationKind): number {
  const row = getDatabase()
    .prepare(
      "SELECT COUNT(*) AS c FROM relationships WHERE target_id = ? AND type = ?",
    )
    .get(personId, kind) as { c: number };
  return row.c;
}

/** Number of godchildren of a given type from `personId` (outgoing links). */
function countOutgoing(personId: string, kind: RelationKind): number {
  const row = getDatabase()
    .prepare(
      "SELECT COUNT(*) AS c FROM relationships WHERE source_id = ? AND type = ?",
    )
    .get(personId, kind) as { c: number };
  return row.c;
}

/** True if a link (of any type) from source to target already exists. */
function edgeExists(sourceId: string, targetId: string): boolean {
  return (
    getDatabase()
      .prepare(
        "SELECT 1 FROM relationships WHERE source_id = ? AND target_id = ?",
      )
      .get(sourceId, targetId) !== undefined
  );
}

/** True if a record exists. */
function personExists(id: string): boolean {
  return (
    getDatabase().prepare("SELECT 1 FROM people WHERE id = ?").get(id) !==
    undefined
  );
}

/** Promotion (graduation year) of a record, or null if unknown or absent. */
function personLevel(id: string): number | null {
  const row = getDatabase()
    .prepare("SELECT level FROM people WHERE id = ?")
    .get(id) as { level: number | null } | undefined;
  return row ? row.level : null;
}

/**
 * True if `toId` is reachable from `fromId` by following parrain -> fillot
 * links (source -> target). Used to detect cycles: adding source -> target
 * would create a cycle if target can already reach source.
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
 * Create a godparent link `sourceId` (godparent) -> `targetId` (godchild) of the
 * given type, enforcing every rule: no self-link, both records must exist, no
 * duplicate, maxima 1/1/3/2, no cycle, and the promo rules (godchild strictly
 * more recent, both promos known, at most MAX_PROMO_GAP years apart). Throws
 * `RelationError` otherwise.
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
    throw new RelationError("INVALID_KIND", m.rel_err_invalid_kind());
  }
  if (sourceId === targetId) {
    throw new RelationError("SELF", m.rel_err_self());
  }
  if (!personExists(sourceId) || !personExists(targetId)) {
    throw new RelationError("NOT_FOUND", m.rel_err_not_found());
  }
  if (edgeExists(sourceId, targetId)) {
    throw new RelationError("DUPLICATE", m.rel_err_duplicate());
  }
  if (countOutgoing(sourceId, kind) >= MAX_FILLOTS[kind]) {
    throw new RelationError(
      "MAX_FILLOT",
      kind === "parrainage"
        ? m.rel_err_max_fillot_official()
        : m.rel_err_max_fillot_adoption(),
    );
  }
  if (countIncoming(targetId, kind) >= MAX_PARRAINS[kind]) {
    throw new RelationError(
      "MAX_PARRAIN",
      kind === "parrainage"
        ? m.rel_err_max_parrain_official()
        : m.rel_err_max_parrain_adoption(),
    );
  }
  if (canReach(targetId, sourceId)) {
    throw new RelationError("CYCLE", m.rel_err_cycle());
  }
  // Promo rules: source = godparent, target = godchild. The godchild must be a
  // strictly more recent, at-most-MAX_PROMO_GAP-younger promotion, and both
  // promos must be known.
  switch (checkPromoPair(personLevel(sourceId), personLevel(targetId))) {
    case "PROMO_UNKNOWN":
      throw new RelationError("PROMO_UNKNOWN", m.rel_err_promo_unknown());
    case "PROMO_ORDER":
      throw new RelationError("PROMO_ORDER", m.rel_err_promo_order());
    case "PROMO_GAP":
      throw new RelationError(
        "PROMO_GAP",
        m.rel_err_promo_gap({ max: MAX_PROMO_GAP }),
      );
  }
  getDatabase()
    .prepare(
      "INSERT INTO relationships (source_id, target_id, type) VALUES (?, ?, ?)",
    )
    .run(sourceId, targetId, kind);
}

/** Raw godparent link (a `relationships` row), else null. */
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

/** Delete a godparent link by its id. True if a row was removed. */
export function removeRelationshipById(id: number): boolean {
  return (
    getDatabase().prepare("DELETE FROM relationships WHERE id = ?").run(id)
      .changes > 0
  );
}

/** A member of a person's entourage (a parrain or a fillot). */
export interface EntourageMember {
  relId: number;
  kind: RelationKind;
  id: string;
  prenom: string;
  nom: string;
  level: number | null;
  /** True when this member is a real account (auth_sub set); false = placeholder. */
  linked: boolean;
}

/** A person's direct entourage: incoming parrains, outgoing fillots. */
export interface Entourage {
  parrains: EntourageMember[];
  fillots: EntourageMember[];
}

/** Raw row of a relationship + people join. */
interface EntourageRow {
  relId: number;
  type: string;
  id: string;
  first_name: string;
  last_name: string;
  level: number | null;
  auth_sub: string | null;
}

function toMember(row: EntourageRow): EntourageMember {
  return {
    relId: row.relId,
    kind: row.type === "adoption" ? "adoption" : "parrainage",
    id: row.id,
    prenom: row.first_name,
    nom: row.last_name,
    level: row.level,
    linked: row.auth_sub !== null,
  };
}

/**
 * A person's direct entourage. `parrains` = incoming links (source = parrain),
 * `fillots` = outgoing links (target = fillot).
 */
export function getEntourage(personId: string): Entourage {
  const database = getDatabase();
  const parrains = (
    database
      .prepare(
        `SELECT r.id AS relId, r.type, p.id, p.first_name, p.last_name, p.level, p.auth_sub
         FROM relationships r JOIN people p ON p.id = r.source_id
         WHERE r.target_id = ? ORDER BY r.type, p.last_name`,
      )
      .all(personId) as EntourageRow[]
  ).map(toMember);
  const fillots = (
    database
      .prepare(
        `SELECT r.id AS relId, r.type, p.id, p.first_name, p.last_name, p.level, p.auth_sub
         FROM relationships r JOIN people p ON p.id = r.target_id
         WHERE r.source_id = ? ORDER BY r.type, p.last_name`,
      )
      .all(personId) as EntourageRow[]
  ).map(toMember);
  return { parrains, fillots };
}

/** Number of parrainage relationships touching a person (as source or target). */
export function countPersonRelations(id: string): number {
  const row = getDatabase()
    .prepare(
      "SELECT COUNT(*) AS n FROM relationships WHERE source_id = ? OR target_id = ?",
    )
    .get(id, id) as { n: number };
  return row.n;
}

/** True if a and b are directly linked by a relationship (either direction). */
export function areDirectlyRelated(aId: string, bId: string): boolean {
  const row = getDatabase()
    .prepare(
      `SELECT 1 FROM relationships
       WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)
       LIMIT 1`,
    )
    .get(aId, bId, bId, aId);
  return row !== undefined;
}

/**
 * True if a and b belong to the same parrainage family: the same connected
 * component of the relationship graph, edges traversed in BOTH directions and
 * regardless of type. A person is trivially in their own family. This lets a
 * member edit any node of the tree they belong to without granting global edit
 * rights. BFS over the graph; fine for the Sky roster size.
 */
export function isSameFamily(aId: string, bId: string): boolean {
  if (aId === bId) {
    return true;
  }
  const database = getDatabase();
  const outStmt = database.prepare(
    "SELECT target_id AS other FROM relationships WHERE source_id = ?",
  );
  const inStmt = database.prepare(
    "SELECT source_id AS other FROM relationships WHERE target_id = ?",
  );
  const visited = new Set<string>();
  const queue: string[] = [aId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === bId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const stmt of [outStmt, inStmt]) {
      for (const r of stmt.all(current) as { other: string }[]) {
        if (!visited.has(r.other)) {
          queue.push(r.other);
        }
      }
    }
  }
  return false;
}

/**
 * Update a placeholder's identity (name/promo), enforcing the "NOM Prenom"
 * format. No-op (returns false) when the record is missing or is a real account
 * (auth_sub set): a linked person's identity is owned by MiConnect and must not
 * be edited by relatives here.
 */
export function updatePlaceholderIdentity(
  id: string,
  firstName: string,
  lastName: string,
  level: number | null,
): boolean {
  const changes = getDatabase()
    .prepare(
      `UPDATE people SET first_name = ?, last_name = ?, level = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND auth_sub IS NULL`,
    )
    .run(
      formatFirstName(firstName),
      formatLastName(lastName),
      level,
      id,
    ).changes;
  return changes > 0;
}

/**
 * Delete a placeholder record and its relationships/links. Refuses (returns false)
 * on a real account (auth_sub set) so an actual user is never removed this way.
 */
export function deletePlaceholderPerson(id: string): boolean {
  const database = getDatabase();
  return database.transaction(() => {
    const row = database
      .prepare("SELECT auth_sub FROM people WHERE id = ?")
      .get(id) as { auth_sub: string | null } | undefined;
    if (!row || row.auth_sub !== null) {
      return false;
    }
    database
      .prepare("DELETE FROM relationships WHERE source_id = ? OR target_id = ?")
      .run(id, id);
    database.prepare("DELETE FROM external_links WHERE person_id = ?").run(id);
    database.prepare("DELETE FROM people WHERE id = ?").run(id);
    return true;
  })();
}

// ============================================
// MERGE SUGGESTIONS (near-duplicate detection)
// ============================================

/** A person as shown in a merge suggestion. */
export interface MergeSuggestionPerson {
  id: string;
  prenom: string;
  nom: string;
  level: number | null;
  linked: boolean;
}

/** A candidate pair of near-duplicate records for the admin to review. */
export interface MergeSuggestion {
  a: MergeSuggestionPerson;
  b: MergeSuggestionPerson;
  distance: number;
}

/**
 * Canonical, order-independent key for a pair of ids. Uses a NUL separator,
 * which cannot appear in an id, so distinct pairs never collide.
 */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/**
 * Near-duplicate pairs for the admin to review: two records whose names are equal
 * or nearly equal (edit distance <= NAME_MATCH_MAX_DISTANCE, nom/prenom inversion
 * tolerated) with compatible promo (equal, unknown on one side, or within a
 * small year tolerance). Pairs where BOTH are real accounts are excluded (two
 * distinct people cannot be merged), as are pairs the admin has ignored. Sorted
 * closest first, capped. O(n^2) with a cheap length-difference prune; fine for
 * the size of the Sky roster.
 */
export function getMergeSuggestions(limit = 100): MergeSuggestion[] {
  const database = getDatabase();
  const people = database
    .prepare("SELECT id, first_name, last_name, level, auth_sub FROM people")
    .all() as {
    id: string;
    first_name: string;
    last_name: string;
    level: number | null;
    auth_sub: string | null;
  }[];

  const ignored = new Set(
    (
      database.prepare("SELECT a_id, b_id FROM ignored_merge_pairs").all() as {
        a_id: string;
        b_id: string;
      }[]
    ).map((r) => pairKey(r.a_id, r.b_id)),
  );

  // Sorted-token normalized length, for a cheap prune before the edit distance.
  const sortedLen = people.map((p) => {
    const tokens = [normalizeName(p.last_name), normalizeName(p.first_name)]
      .filter((t) => t.length > 0)
      .sort()
      .join(" ");
    return tokens.length;
  });

  const toSuggestionPerson = (p: {
    id: string;
    first_name: string;
    last_name: string;
    level: number | null;
    auth_sub: string | null;
  }): MergeSuggestionPerson => ({
    id: p.id,
    prenom: p.first_name,
    nom: p.last_name,
    level: p.level,
    linked: p.auth_sub !== null,
  });

  const out: MergeSuggestion[] = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const A = people[i];
      const B = people[j];
      if (A.auth_sub !== null && B.auth_sub !== null) {
        continue; // two real accounts: not mergeable
      }
      if (Math.abs(sortedLen[i] - sortedLen[j]) > NAME_MATCH_MAX_DISTANCE) {
        continue;
      }
      // Promo compatibility: equal, unknown on one side, or within a small year
      // tolerance (data-entry slip + the 3-year entry/graduation offset).
      if (
        A.level !== null &&
        B.level !== null &&
        Math.abs(A.level - B.level) > 3
      ) {
        continue;
      }
      const d = nameDistance(
        A.last_name,
        A.first_name,
        B.last_name,
        B.first_name,
      );
      if (d > NAME_MATCH_MAX_DISTANCE) {
        continue;
      }
      if (ignored.has(pairKey(A.id, B.id))) {
        continue;
      }
      out.push({
        a: toSuggestionPerson(A),
        b: toSuggestionPerson(B),
        distance: d,
      });
    }
  }

  out.sort((x, y) => x.distance - y.distance);
  return out.slice(0, limit);
}

/** Mark a suggested pair as ignored so it stops being proposed. */
export function ignoreMergePair(aId: string, bId: string): void {
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  getDatabase()
    .prepare(
      "INSERT OR IGNORE INTO ignored_merge_pairs (a_id, b_id) VALUES (?, ?)",
    )
    .run(x, y);
}

/** An entourage member exposed to an external app (Canari): keyed by sub. */
export interface ExternalEntourageMember {
  prenom: string;
  nom: string;
  level: number | null;
  kind: RelationKind;
  sub: string | null; // the member's Authentik sub (to link to their Canari profile)
}

/** A person's entourage (parrains/fillots), keyed by their Authentik sub. */
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
 * A person's entourage resolved by their Authentik sub (= the shared key with
 * Canari). Returns `found: false` if no record is linked to this sub. Each
 * member carries its own sub so Canari can link to its profile.
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

/** A namesake record proposed as a link candidate (dedup at creation). */
export interface NamesakeCandidate {
  id: string;
  firstName: string;
  lastName: string;
  level: number | null;
  linked: boolean;
}

/**
 * Records whose normalized last+first name match, linked or not (dedup when
 * creating an entourage member: propose linking rather than duplicating).
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
 * Create a placeholder record (no account) for an entourage member. The id is
 * generated as `prenom.nom[.promo][.idx]`. `createdBy` records the author.
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

/**
 * Atomically create a placeholder star AND link it to `centerId` in one
 * transaction. The relation rules (addParrainage: promo order/gap, slot maxima,
 * cycle, ...) are enforced INSIDE the transaction, so any violation rolls back
 * the creation - no orphan placeholder is ever persisted. This is why linking
 * validation must not run after a standalone createPlaceholderPerson. Returns the
 * new person id; throws `RelationError` (nothing persisted) on a rule violation.
 */
export function createPlaceholderAndLink(
  firstName: string,
  lastName: string,
  level: number | null,
  createdBy: string,
  centerId: string,
  role: "parrain" | "fillot",
  kind: RelationKind,
): string {
  console.debug(
    `[Entourage] createPlaceholderAndLink center=${centerId} role=${role} kind=${kind}`,
  );
  return getDatabase().transaction(() => {
    const id = createPlaceholderPerson(firstName, lastName, level, createdBy);
    // parrain = the new star is the godparent (source), fillot = the godchild.
    const sourceId = role === "parrain" ? id : centerId;
    const targetId = role === "parrain" ? centerId : id;
    addParrainage(sourceId, targetId, kind);
    return id;
  })();
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

    const status = record(
      true,
      null,
      Object.keys(positions).length,
      nodeIds.length,
    );
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
