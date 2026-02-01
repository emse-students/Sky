import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "../database/sky.db");
const oldPositionsPath = path.join(__dirname, "../static/data/positions.json");
const newPositionsPath = path.join(
  __dirname,
  "../static/data/positions.json.new",
);

console.log("📍 Mise à jour de positions.json avec les nouveaux IDs...\n");

// Lire l'ancien fichier
const oldPositions = JSON.parse(fs.readFileSync(oldPositionsPath, "utf-8"));
console.log(
  `Anciennes positions : ${Object.keys(oldPositions).length} entrées`,
);

// Ouvrir la base de données
const db = new Database(dbPath, { readonly: true });

// Créer la correspondance nom_prenom → prenom.nom
const mapping = {};
const allPeople = db
  .prepare("SELECT id, first_name, last_name FROM people")
  .all();

for (const person of allPeople) {
  // Normaliser : enlever accents et mettre en minuscules
  const normalize = (str) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const normalizedFirst = normalize(person.first_name);
  const normalizedLast = normalize(person.last_name);

  // Format old: nom_prenom
  const oldId = `${normalizedLast}_${normalizedFirst}`;
  const newId = person.id;
  mapping[oldId] = newId;
}

console.log("Exemples de mapping:");
Object.entries(mapping)
  .slice(0, 5)
  .forEach(([old, newId]) => {
    console.log(`  ${old} → ${newId}`);
  });

console.log(`Mapping créé : ${Object.keys(mapping).length} correspondances\n`);

// Convertir les positions
const newPositions = {};
let convertedCount = 0;
let notFoundCount = 0;

for (const [oldId, position] of Object.entries(oldPositions)) {
  const newId = mapping[oldId];
  if (newId) {
    newPositions[newId] = position;
    convertedCount++;
  } else {
    console.warn(`⚠️ Pas de correspondance pour: ${oldId}`);
    notFoundCount++;
  }
}

console.log(`✅ Converties : ${convertedCount}`);
console.log(`❌ Non trouvées : ${notFoundCount}`);
console.log(`Total : ${Object.keys(newPositions).length}\n`);

// Écrire le nouveau fichier
fs.writeFileSync(
  oldPositionsPath,
  JSON.stringify(newPositions, null, 2),
  "utf-8",
);
console.log("✅ positions.json mis à jour !\n");

db.close();
