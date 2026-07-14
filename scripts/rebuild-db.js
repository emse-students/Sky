/**
 * Reconstruction v1 : on repart d une base vierge tout en conservant l ancienne
 * en lecture seule.
 *
 * 1. Snapshot : copie `sky.db` -> `sky-legacy.db` (une seule fois, si absent),
 *    via l API de sauvegarde SQLite (coherente, WAL-safe). Cette base figee
 *    alimente la fenetre de consultation `/admin/legacy`.
 * 2. Wipe : vide les tables de donnees vivantes (people, relationships,
 *    external_links, associations) une seule fois, garde par le flag metadata
 *    `rebuild_v1_done`. Conserve sessions/metadata.
 *
 * Idempotent : rejouable a chaque demarrage (apres init-db / migrate-auth).
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../database/sky.db");
const legacyPath = path.join(__dirname, "../database/sky-legacy.db");

if (!fs.existsSync(dbPath)) {
  console.error("[rebuild-db] Base introuvable:", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

async function main() {
  // 1. Snapshot legacy (une seule fois).
  if (!fs.existsSync(legacyPath)) {
    console.log(
      "[rebuild-db] Snapshot de la base actuelle -> sky-legacy.db ...",
    );
    await db.backup(legacyPath);
    console.log("[rebuild-db] Snapshot legacy cree.");
  } else {
    console.log("[rebuild-db] sky-legacy.db deja present, snapshot ignore.");
  }

  // 2. Wipe des donnees vivantes (une seule fois).
  const flag = db
    .prepare("SELECT value FROM metadata WHERE key = 'rebuild_v1_done'")
    .get();
  if (flag) {
    console.log("[rebuild-db] Wipe deja effectue (rebuild_v1_done), ignore.");
    return;
  }

  const tableExists = (name) =>
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name) !== undefined;
  const clear = (name) => {
    if (tableExists(name)) {
      db.prepare(`DELETE FROM ${name}`).run();
    }
  };

  const wipe = db.transaction(() => {
    // Ordre : enfants avant people (FK). Tables absentes de l ancien schema ignorees.
    clear("relationships");
    clear("external_links");
    clear("associations");
    clear("people");
    db.prepare(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES ('rebuild_v1_done', datetime('now'))",
    ).run();
  });
  wipe();
  console.log(
    "[rebuild-db] Tables vivantes videes (people/relationships/links/assos).",
  );
}

main()
  .then(() => console.log("[rebuild-db] Termine."))
  .catch((error) => {
    console.error("[rebuild-db] Echec:", error);
    process.exit(1);
  });
