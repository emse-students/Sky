import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { Person, JsonRelation, GraphDataFile } from "$types/graph";
import { normalizeName } from "$utils/format";

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

/**
 * Cherche une fiche people NON liee correspondant a (nom, prenom, promotion).
 * La comparaison des noms est faite en JS apres normalisation (SQLite ne sait
 * pas retirer les accents). Retourne la 1re correspondance (log si ambiguite).
 */
export function findUnlinkedPersonIdByIdentity(
  lastName: string,
  firstName: string,
  level: number | null,
): string | null {
  const database = getDatabase();
  const rows = database
    .prepare(
      "SELECT id, first_name, last_name FROM people WHERE auth_sub IS NULL AND level IS ?",
    )
    .all(level ?? null) as {
    id: string;
    first_name: string;
    last_name: string;
  }[];

  const nLast = normalizeName(lastName);
  const nFirst = normalizeName(firstName);
  const matches = rows.filter(
    (r) =>
      normalizeName(r.last_name) === nLast &&
      normalizeName(r.first_name) === nFirst,
  );

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    console.warn(
      `[auth-link] ${matches.length} fiches non liees pour ${nFirst} ${nLast} (promo ${level ?? "?"}) ; liaison de la premiere (${matches[0].id})`,
    );
  }
  return matches[0].id;
}

/** Lie une fiche existante a un compte Authentik et rafraichit ses infos SSO. */
export function linkPersonAuth(id: string, identity: OidcIdentity): void {
  const database = getDatabase();
  database
    .prepare(
      `UPDATE people SET
        auth_sub = ?,
        email = COALESCE(?, email),
        formation = COALESCE(?, formation),
        role = ?,
        last_login = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    )
    .run(
      identity.sub,
      identity.email,
      identity.formation,
      identity.role,
      nowEpoch(),
      id,
    );
}

/** Rafraichit les champs d identite d une fiche deja liee (a chaque login SSO). */
export function refreshPersonIdentity(id: string, identity: OidcIdentity): void {
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
 * Resout (ou cree) la fiche people correspondant a une identite Authentik :
 *   1. deja liee a ce sub      -> rafraichit
 *   2. fiche non liee (nom, prenom, promo) -> lie
 *   3. aucune                  -> cree une nouvelle fiche
 * Retourne l id de la fiche people.
 */
export function linkOrCreateAuthPerson(identity: OidcIdentity): string {
  const existing = getPersonIdByAuthSub(identity.sub);
  if (existing) {
    refreshPersonIdentity(existing, identity);
    return existing;
  }
  const match = findUnlinkedPersonIdByIdentity(
    identity.lastName,
    identity.firstName,
    identity.level,
  );
  if (match) {
    linkPersonAuth(match, identity);
    return match;
  }
  return createAuthedPerson(identity);
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

// Get relationships for a specific person with details
export function getRelationships(personId: string): Array<{
  id: number;
  person_id_1: string;
  person_id_2: string;
  type: string;
  other_person_id: string;
  other_person_name: string;
  target_name: string;
  source_name: string;
}> {
  const database = getDatabase();
  const stmt = database.prepare(`
		SELECT 
			r.id,
			r.source_id as person_id_1,
			r.target_id as person_id_2,
			r.type,
			CASE 
				WHEN r.source_id = ? THEN r.target_id
				ELSE r.source_id
			END as other_person_id,
			CASE 
				WHEN r.source_id = ? THEN p2.last_name || ' ' || p2.first_name
				ELSE p1.last_name || ' ' || p1.first_name
			END as other_person_name,
			p2.first_name || ' ' || p2.last_name as target_name,
			p1.first_name || ' ' || p1.last_name as source_name
		FROM relationships r
		LEFT JOIN people p1 ON r.source_id = p1.id
		LEFT JOIN people p2 ON r.target_id = p2.id
		WHERE r.source_id = ? OR r.target_id = ?
		ORDER BY r.type, other_person_name
	`);

  return stmt.all(personId, personId, personId, personId) as Array<{
    id: number;
    person_id_1: string;
    person_id_2: string;
    type: string;
    other_person_id: string;
    other_person_name: string;
    target_name: string;
    source_name: string;
  }>;
}

// ============================================
// POSITIONS CALCULATION
// ============================================

export async function recalculatePositions(): Promise<void> {
  const { spawn } = await import("child_process");
  const path = await import("path");
  const { fileURLToPath } = await import("url");

  // Get the project root directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, "../../..");

  return new Promise((resolve, reject) => {
    console.debug("[Positions] Lancement du calcul des positions...");

    // Try python3 first, then fallback to python
    const pythonCommand = process.platform === "win32" ? "python" : "python3";

    const pythonProcess = spawn(
      pythonCommand,
      [path.join(projectRoot, "scripts", "calcul_positions.py")],
      {
        cwd: projectRoot,
      },
    );

    pythonProcess.stdout.on("data", (data: Buffer) => {
      console.debug(`[calcul_positions] ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on("data", (data: Buffer) => {
      console.error(`[calcul_positions] ${data.toString().trim()}`);
    });

    pythonProcess.on("close", (code) => {
      if (code === 0) {
        console.debug("[Positions] Calcul des positions terminé avec succès");
        resolve();
      } else {
        console.error(
          `[Positions] Calcul des positions échoué avec le code ${code}`,
        );
        reject(new Error(`Python process exited with code ${code}`));
      }
    });
  });
}
