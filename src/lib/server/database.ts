import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Person, JsonRelation, GraphDataFile } from '$types/graph';

const DB_PATH = path.join(process.cwd(), 'database', 'sky.db');
const SCHEMA_PATH = path.join(process.cwd(), 'database', 'schema.sql');

export { DB_PATH };

let db: Database.Database | null = null;

function initializeSchema(database: Database.Database): void {
	try {
		// Check if schema exists
		const tableCheck = database.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='people'"
		).get();

		if (!tableCheck) {
			console.debug('[Database] Initializing schema...');

			// Try to read schema file
			if (fs.existsSync(SCHEMA_PATH)) {
				const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
				database.exec(schema);
				console.debug('[Database] Schema initialized from schema.sql');
			} else {
				// Fallback to inline schema if file not found
				console.debug('[Database] schema.sql not found, using inline schema');
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
				console.debug('[Database] Schema initialized with inline fallback');
			}
		}
	} catch (error) {
		console.error('[Database] Failed to initialize schema:', error);
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
		db.pragma('foreign_keys = ON');

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
			nom: row.last_name
		};

		// Get external links
		const linksStmt = database.prepare(
			'SELECT type, url FROM external_links WHERE person_id = ? ORDER BY display_order'
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
		nom: row.last_name
	};

	// Get external links
	const linksStmt = database.prepare(
		'SELECT type, url FROM external_links WHERE person_id = ? ORDER BY display_order'
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
	person: Omit<Person, 'id'> & { id?: string }
): string {
	const database = getDatabase();

	const id =
    person.id ||
    `${person.prenom}.${person.nom}`
    	.toLowerCase()
    	.normalize('NFD')
    	.replace(/[\u0300-\u036f]/g, '')
    	.replace(/[^a-z0-9.]/g, '');

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
		person.image || 'default.jpg'
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
		id
	);

	// Update links if provided
	if (updates.links !== undefined) {
		database.prepare('DELETE FROM external_links WHERE person_id = ?').run(id);
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
						`[Database] Failed to insert link '${type}': ${url} for user ${id}. Error: ${message}`
					);
				}
			}
		}
	}

	return result.changes > 0;
}

export function deletePerson(id: string): boolean {
	const database = getDatabase();
	const stmt = database.prepare('DELETE FROM people WHERE id = ?');
	const result = stmt.run(id);
	return result.changes > 0;
}

export function mergePeople(sourceId: string, targetId: string): void {
	const database = getDatabase();

	database.transaction(() => {
		// 1. Move relationships requests (target_id = sourceId)
		// I am the TARGET (fillot), so these are my Parrains.
		const incoming = database
			.prepare('SELECT id, source_id, type FROM relationships WHERE target_id = ?')
			.all(sourceId) as { id: number; source_id: string; type: string }[];

		for (const rel of incoming) {
			try {
				database
					.prepare('UPDATE relationships SET target_id = ? WHERE id = ?')
					.run(targetId, rel.id);
			} catch {
				// Constraint violation (duplicate), delete this one
				console.warn(
					`Duplicate incoming relation from ${rel.source_id} during merge, deleting.`
				);
				database.prepare('DELETE FROM relationships WHERE id = ?').run(rel.id);
			}
		}

		// 2. Move relationships source (source_id = sourceId)
		// I am the SOURCE (parrain), so these are my Fillots.
		const outgoing = database
			.prepare('SELECT id, target_id, type FROM relationships WHERE source_id = ?')
			.all(sourceId) as { id: number; target_id: string; type: string }[];

		for (const rel of outgoing) {
			try {
				database
					.prepare('UPDATE relationships SET source_id = ? WHERE id = ?')
					.run(targetId, rel.id);
			} catch {
				console.warn(
					`Duplicate outgoing relation to ${rel.target_id} during merge, deleting.`
				);
				database.prepare('DELETE FROM relationships WHERE id = ?').run(rel.id);
			}
		}

		// 3. Move external links
		const links = database
			.prepare('SELECT id, url FROM external_links WHERE person_id = ?')
			.all(sourceId) as { id: number; url: string }[];

		for (const link of links) {
			try {
				database
					.prepare('UPDATE external_links SET person_id = ? WHERE id = ?')
					.run(targetId, link.id);
			} catch {
				// Duplicate url for target
				database.prepare('DELETE FROM external_links WHERE id = ?').run(link.id);
			}
		}

		// 4. Delete the source person
		database.prepare('DELETE FROM people WHERE id = ?').run(sourceId);
	})();
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
		type: row.type
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
		console.error('Create relationship error:', error);
		return false;
	}
}

export function deleteRelationship(
	source: string,
	target: string,
	type?: string
): boolean {
	const database = getDatabase();
	let query = 'DELETE FROM relationships WHERE source_id = ? AND target_id = ?';
	const params: string[] = [source, target];

	if (type) {
		query += ' AND type = ?';
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
		relationships
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
			END as other_person_name
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
  }>;
}

// ============================================
// POSITIONS CALCULATION
// ============================================

export async function recalculatePositions(): Promise<void> {
	const { spawn } = await import('child_process');
	const path = await import('path');
	const { fileURLToPath } = await import('url');

	// Get the project root directory
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const projectRoot = path.resolve(__dirname, '../../..');

	return new Promise((resolve, reject) => {
		console.debug('🔄 Lancement du calcul des positions...');

		// Try python3 first, then fallback to python
		const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

		const pythonProcess = spawn(
			pythonCommand,
			[path.join(projectRoot, 'scripts', 'calcul_positions.py')],
			{
				cwd: projectRoot
			}
		);

		pythonProcess.stdout.on('data', (data: Buffer) => {
			console.debug(`[calcul_positions] ${data.toString().trim()}`);
		});

		pythonProcess.stderr.on('data', (data: Buffer) => {
			console.error(`[calcul_positions] ${data.toString().trim()}`);
		});

		pythonProcess.on('close', (code) => {
			if (code === 0) {
				console.debug('✅ Calcul des positions terminé avec succès');
				resolve();
			} else {
				console.error(`❌ Calcul des positions échoué avec le code ${code}`);
				reject(new Error(`Python process exited with code ${code}`));
			}
		});
	});
}
