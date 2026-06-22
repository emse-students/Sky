import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "../database/sky.db");
const schemaPath = path.join(__dirname, "../database/schema.sql");

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;

try {
  console.log("🔍 Vérification de l'intégrité de la base de données...");

  // Open database (creates it if it doesn't exist)
  db = new Database(dbPath);

  // 1. Check if tables exist
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => row.name);

  if (!tables.includes("people")) {
    console.log("⚠️ Table 'people' manquante. Application du schéma...");
    applySchema();
  } else {
    // 2. Check columns in people
    const columns = db
      .prepare("PRAGMA table_info(people)")
      .all()
      .map((row) => row.name);

    if (!columns.includes("bio")) {
      console.log("⚠️ Colonne 'bio' manquante dans 'people'. Correction...");
      db.prepare("ALTER TABLE people ADD COLUMN bio TEXT").run();
      console.log("✅ Colonne 'bio' ajoutée.");
    }

    if (!columns.includes("image_url") && !columns.includes("image")) {
      // Note: schema uses image_url, code might fallback
      console.log("ℹ️ Vérification des colonnes d'image standard...");
    }
  }

  // 3. Check associations table
  if (!tables.includes("associations")) {
    console.log("⚠️ Table 'associations' manquante. Création...");
    db.exec(`
        CREATE TABLE IF NOT EXISTS associations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT,
            logo_url TEXT,
            display_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_associations_person ON associations(person_id);
      `);
    console.log("✅ Table 'associations' créée.");
  }

  // 4. Rebuild FTS index if corrupted or missing
  try {
    const ftsTest = db
      .prepare("SELECT COUNT(*) as count FROM people_fts")
      .get();
    const peopleCount = db
      .prepare("SELECT COUNT(*) as count FROM people")
      .get();

    if (!ftsTest || ftsTest.count !== peopleCount.count) {
      console.log("⚠️ Index FTS désynchronisé. Reconstruction...");
      rebuildFTS();
    }
  } catch (error) {
    console.log("⚠️ Index FTS manquant ou corrompu. Reconstruction...");
    rebuildFTS();
  }

  console.log("✅ Intégrité de la base de données vérifiée.");
} catch (error) {
  console.error(
    "❌ Erreur critique lors de la vérification de la base de données:",
    error,
  );
  process.exit(1);
}

function applySchema() {
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, "utf8");
    // Execute schema in parts to avoid errors if some tables exist
    // Simpler: just exec. SQLite IF NOT EXISTS handles it.
    db.exec(schema);
    console.log("✅ Schéma appliqué avec succès.");
  } else {
    console.error("❌ Fichier de schéma introuvable:", schemaPath);
    process.exit(1);
  }
}

function rebuildFTS() {
  try {
    db.prepare("DROP TABLE IF EXISTS people_fts").run();
    db.prepare(
      `
      CREATE VIRTUAL TABLE people_fts USING fts5(
        id,
        first_name,
        last_name,
        content='people',
        content_rowid='rowid'
      )
    `,
    ).run();
    db.prepare(
      `
      INSERT INTO people_fts(rowid, id, first_name, last_name)
      SELECT rowid, id, first_name, last_name FROM people
    `,
    ).run();
    console.log("✅ Index FTS reconstruit.");
  } catch (error) {
    console.error("❌ Erreur lors de la reconstruction FTS:", error);
  }
}
