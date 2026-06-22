/**
 * Migration BDD : identite SSO Authentik dans `people` + table `sessions`.
 *
 * Idempotente (rejouable a chaque demarrage du conteneur, apres init-db et
 * migrate-add-bio). Ajoute les colonnes d identite a `people`, l index unique sur
 * auth_sub, et cree la table `sessions`. Remplace l ancienne base auth.db.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../database/sky.db");

if (!fs.existsSync(dbPath)) {
  console.error("[migrate-auth] Database not found at", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

/** Ajoute une colonne si absente (ALTER TABLE ... ADD COLUMN idempotent). */
function addColumn(table, definition) {
  const name = definition.split(/\s+/)[0];
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
    console.log(`[migrate-auth] Colonne ${table}.${name} ajoutee.`);
  } catch (error) {
    if (String(error.message).includes(`duplicate column name: ${name}`)) {
      console.log(`[migrate-auth] Colonne ${table}.${name} deja presente.`);
    } else {
      throw error;
    }
  }
}

try {
  // Colonnes d identite SSO sur people.
  addColumn("people", "auth_sub TEXT");
  addColumn("people", "email TEXT");
  addColumn("people", "formation TEXT");
  addColumn("people", "role TEXT NOT NULL DEFAULT 'user'");
  addColumn("people", "last_login INTEGER");

  // Un seul compte Authentik par fiche (NULL non contraints).
  db.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_people_auth_sub ON people(auth_sub) WHERE auth_sub IS NOT NULL",
  ).run();

  // Table sessions (remplace auth.db).
  db.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    )`,
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_sessions_person ON sessions(person_id)",
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)",
  ).run();

  console.log("[migrate-auth] Migration terminee.");
} catch (error) {
  console.error("[migrate-auth] Echec de la migration:", error);
  process.exit(1);
}
