import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "../database/sky.db");
const oldPositionsPath = path.join(__dirname, "../database/positions.json");

console.log("📍 Migrating positions.json to the new IDs...\n");

// Read the existing file
const oldPositions = JSON.parse(fs.readFileSync(oldPositionsPath, "utf-8"));
console.log(`Old positions: ${Object.keys(oldPositions).length} entries`);

// Open the database
const db = new Database(dbPath, { readonly: true });

// Build the mapping last_first -> prenom.nom (new id)
const mapping = {};
const allPeople = db
  .prepare("SELECT id, first_name, last_name FROM people")
  .all();

for (const person of allPeople) {
  // Normalise: strip accents and lowercase
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

console.log("Mapping samples:");
Object.entries(mapping)
  .slice(0, 5)
  .forEach(([old, newId]) => {
    console.log(`  ${old} → ${newId}`);
  });

console.log(`Mapping built: ${Object.keys(mapping).length} entries\n`);

// Convert the positions
const newPositions = {};
let convertedCount = 0;
let notFoundCount = 0;

for (const [oldId, position] of Object.entries(oldPositions)) {
  const newId = mapping[oldId];
  if (newId) {
    newPositions[newId] = position;
    convertedCount++;
  } else {
    console.warn(`⚠️ No mapping for: ${oldId}`);
    notFoundCount++;
  }
}

console.log(`✅ Converted: ${convertedCount}`);
console.log(`❌ Not found: ${notFoundCount}`);
console.log(`Total: ${Object.keys(newPositions).length}\n`);

// Write the file back in place
fs.writeFileSync(
  oldPositionsPath,
  JSON.stringify(newPositions, null, 2),
  "utf-8",
);
console.log("✅ positions.json updated!\n");

db.close();
