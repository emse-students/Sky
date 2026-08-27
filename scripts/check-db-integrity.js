/**
 * Verification d'integrite de la base : elle CONSTATE, elle ne repare pas.
 *
 * Appelee apres un import de base par l'admin (POST /api/admin/import), sur un
 * fichier qui vient de l'exterieur et dont personne ne garantit le schema. Sa
 * seule mission est de dire si le fichier importe est utilisable par le code, et
 * d'echouer bruyamment sinon.
 *
 * Ce qu'elle ne fait PLUS, et pourquoi :
 *
 *   - Elle rejouait `ALTER TABLE people ADD COLUMN bio TEXT` des que la colonne
 *     manquait. `bio` a ete supprimee du schema le 2026-08-26 : la "reparation"
 *     ressuscitait donc a chaque import une colonne que la migration venait
 *     d'enlever, et les deux se seraient battues indefiniment.
 *   - Elle portait une copie inline de la table `associations`, deuxieme source
 *     de verite a cote de schema.sql - exactement la divergence qui avait deja
 *     coute une base sans la colonne `bio` du cote de database.ts.
 *   - Elle reconstruisait l'index FTS `people_fts`, supprime le 2026-08-26 parce
 *     qu'aucune requete ne le lisait.
 *   - Elle avait une branche qui comparait `image_url` et `image` pour ne rien
 *     faire d'autre qu'ecrire une ligne de log.
 *
 * Une reparation destructive doit etre conditionnee au fait de SAVOIR que l'etat
 * est casse. Ici rien ne le savait : le seul declencheur etait "la colonne n'est
 * pas la", ce qui est aussi ce que produit une suppression volontaire.
 */
import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../database/sky.db");

/**
 * Ce que le code interroge reellement. Toute divergence avec schema.sql est un
 * defaut de CE fichier : les deux se lisent cote a cote.
 */
const EXPECTED = {
  people: [
    "id",
    "first_name",
    "last_name",
    "level",
    "auth_sub",
    "email",
    "formation",
    "role",
    "last_login",
    "created_by",
    "created_at",
    "updated_at",
  ],
  relationships: ["id", "source_id", "target_id", "type", "created_at"],
  associations: [
    "id",
    "person_id",
    "name",
    "role",
    "logo_url",
    "display_order",
    "created_at",
  ],
  sessions: ["token", "person_id", "expires_at", "created_at"],
  pending_links: [
    "token",
    "sub",
    "first_name",
    "last_name",
    "level",
    "email",
    "formation",
    "role",
    "expires_at",
    "created_at",
  ],
  metadata: ["key", "value", "updated_at"],
};

/** Objets que le schema courant ne doit PLUS porter (voir migrate-drop-dead-schema.js). */
const FORBIDDEN_TABLES = ["people_fts", "external_links"];
const FORBIDDEN_COLUMNS = { people: ["bio", "image_url"] };

if (!fs.existsSync(dbPath)) {
  console.error("[check-db-integrity] Base introuvable:", dbPath);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const problems = [];

const tables = new Set(
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((r) => r.name),
);

for (const [table, expectedColumns] of Object.entries(EXPECTED)) {
  if (!tables.has(table)) {
    problems.push(`table manquante: ${table}`);
    continue;
  }
  const actual = new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => r.name),
  );
  for (const column of expectedColumns) {
    if (!actual.has(column)) {
      problems.push(`colonne manquante: ${table}.${column}`);
    }
  }
}

// Un residu n'empeche pas de lire, mais il signale une base plus vieille que le
// code : la migration doit passer dessus avant qu'on la declare saine.
for (const table of FORBIDDEN_TABLES) {
  if (tables.has(table)) {
    problems.push(
      `table obsolete encore presente: ${table} (lancer migrate-drop-dead-schema.js)`,
    );
  }
}
for (const [table, columns] of Object.entries(FORBIDDEN_COLUMNS)) {
  if (!tables.has(table)) {
    continue;
  }
  const actual = new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => r.name),
  );
  for (const column of columns) {
    if (actual.has(column)) {
      problems.push(
        `colonne obsolete encore presente: ${table}.${column} (lancer migrate-drop-dead-schema.js)`,
      );
    }
  }
}

const integrity = db.prepare("PRAGMA integrity_check").get();
const integrityResult = integrity ? Object.values(integrity)[0] : "inconnu";
if (integrityResult !== "ok") {
  problems.push(`PRAGMA integrity_check: ${integrityResult}`);
}

const peopleRow = tables.has("people")
  ? db.prepare("SELECT count(*) c FROM people").get()
  : null;

db.close();

if (problems.length > 0) {
  console.error(
    `[check-db-integrity] ${problems.length} probleme(s) sur ${dbPath}:`,
  );
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `[check-db-integrity] Base saine: ${Object.keys(EXPECTED).length} tables attendues presentes, ${peopleRow ? peopleRow.c : 0} fiche(s).`,
);
