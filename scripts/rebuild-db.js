/**
 * Reconstruction v1 : on repart d une base vierge.
 *
 * Wipe : vide les tables de donnees vivantes (people, relationships,
 * associations) une seule fois, garde par le flag metadata
 * `rebuild_v1_done`. Conserve sessions/metadata.
 *
 * Idempotent : rejouable a chaque demarrage (apres init-db / migrate-auth).
 */
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../database/sky.db');

if (!fs.existsSync(dbPath)) {
  console.error('[rebuild-db] Base introuvable:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

function main() {
  const flag = db.prepare("SELECT value FROM metadata WHERE key = 'rebuild_v1_done'").get();
  if (flag) {
    console.log('[rebuild-db] Wipe deja effectue (rebuild_v1_done), ignore.');
    return;
  }

  // `bun:sqlite` renvoie `null` quand `.get()` ne trouve rien, la ou
  // better-sqlite3 renvoyait `undefined` : le test doit couvrir les deux.
  const tableExists = (name) =>
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name) != null;
  const clear = (name) => {
    if (tableExists(name)) {
      db.prepare(`DELETE FROM ${name}`).run();
    }
  };

  const wipe = db.transaction(() => {
    // Ordre : enfants avant people (FK). Tables absentes de l ancien schema ignorees.
    clear('relationships');
    clear('associations');
    clear('people');
    db.prepare(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES ('rebuild_v1_done', datetime('now'))"
    ).run();
  });
  wipe();
  console.log('[rebuild-db] Tables vivantes videes (people/relationships/links/assos).');
}

try {
  main();
  console.log('[rebuild-db] Termine.');
} catch (error) {
  console.error('[rebuild-db] Echec:', error);
  process.exit(1);
}
