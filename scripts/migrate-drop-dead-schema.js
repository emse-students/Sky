/**
 * Migration BDD : suppression des morceaux de schema que plus rien ne lit.
 *
 * Deux ensembles, mesures avant suppression, et l'ordre entre les deux compte.
 *
 * 1. L'index de recherche `people_fts` (FTS5, `content=people`) et ses trois
 *    triggers de synchronisation. Le lecteur a disparu quand la recherche est
 *    passee au scorer `personMatchScore` - le `MATCH` ne renvoyait rien des que
 *    l'index avait derive. Le chemin d'ECRITURE, lui, est reste : trois triggers
 *    sur chaque insert, update et delete de `people`, pour une table qu'aucune
 *    requete n'interroge.
 *
 * 2. Les vestiges du profil que Sky n'heberge plus. Sky n'edite que les
 *    parrainages ; bio, photo et liens viennent de Canari et de MiGallery.
 *    Mesure sur la base de production le 2026-08-26 :
 *      - `people.bio`       : 0 ligne non vide sur 725.
 *      - `external_links`   : 0 ligne, toutes categories confondues.
 *      - `people.image_url` : 725 lignes sur 725 valant le litteral
 *                             "default.jpg" ecrit par createPerson. La seule
 *                             lecture qui pouvait s'en servir exigeait
 *                             `startsWith("http")`, donc elle n'a jamais pu etre
 *                             vraie : le flux tombait toujours sur MiGallery.
 *
 * ORDRE : les triggers et la table FTS partent EN PREMIER. `people_fts` est une
 * table a contenu externe adossee a `people` ; retirer une colonne de `people`
 * pendant que les triggers existent laisserait une ecriture ulterieure echouer
 * sur une table que la migration s'appretait justement a supprimer.
 *
 * Idempotente : rejouable a chaque demarrage du conteneur. Chaque operation est
 * gardee par une lecture du schema reel, jamais par un try/catch qui avalerait
 * une vraie erreur.
 */
import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../database/sky.db");

if (!fs.existsSync(dbPath)) {
  console.error("[migrate-drop-dead-schema] Base introuvable:", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

/** Colonnes reellement presentes sur une table. */
function columnsOf(table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((r) => r.name);
}

/**
 * Vrai si l'objet existe dans le schema. `bun:sqlite` renvoie `null` (et non
 * `undefined`) quand `.get()` ne trouve rien, d'ou le test sur `!= null`.
 */
function schemaObjectExists(type, name) {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name = ?")
      .get(type, name) != null
  );
}

let changed = 0;

// --- 1. L'index de recherche que personne ne lit ---------------------------
for (const trigger of [
  "people_fts_insert",
  "people_fts_delete",
  "people_fts_update",
]) {
  if (schemaObjectExists("trigger", trigger)) {
    db.exec(`DROP TRIGGER ${trigger}`);
    console.log(`[migrate-drop-dead-schema] trigger ${trigger} supprime`);
    changed += 1;
  }
}

if (schemaObjectExists("table", "people_fts")) {
  db.exec("DROP TABLE people_fts");
  console.log("[migrate-drop-dead-schema] table people_fts supprimee");
  changed += 1;
}

// --- 2. Les vestiges du profil ---------------------------------------------
for (const column of ["bio", "image_url"]) {
  if (columnsOf("people").includes(column)) {
    db.exec(`ALTER TABLE people DROP COLUMN ${column}`);
    console.log(`[migrate-drop-dead-schema] people.${column} supprimee`);
    changed += 1;
  }
}

if (schemaObjectExists("table", "external_links")) {
  // Compte avant destruction : si la table s'est repeuplee depuis la mesure, la
  // migration doit le DIRE plutot que d'emporter des donnees en silence.
  const { c } = db.prepare("SELECT count(*) c FROM external_links").get();
  if (c > 0) {
    console.error(
      `[migrate-drop-dead-schema] external_links contient ${c} ligne(s) alors que la mesure du 2026-08-26 en donnait 0 - suppression annulee, quelque chose ecrit encore dedans`,
    );
    process.exit(1);
  }
  db.exec("DROP INDEX IF EXISTS idx_external_links_person");
  db.exec("DROP TABLE external_links");
  console.log("[migrate-drop-dead-schema] table external_links supprimee");
  changed += 1;
}

console.log(
  changed === 0
    ? "[migrate-drop-dead-schema] rien a faire, schema deja a jour"
    : `[migrate-drop-dead-schema] ${changed} operation(s) appliquee(s)`,
);

db.close();
