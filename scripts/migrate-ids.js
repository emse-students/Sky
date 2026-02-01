/**
 * Migration script to convert IDs from nom_prenom to prenom.nom format
 * and split name into separate first_name and last_name fields
 */

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, "..", "database", "sky.db");

console.log("🚀 Starting ID migration...\n");

const db = new Database(DB_PATH);

// Disable foreign key checks during migration
db.pragma("foreign_keys = OFF");

// Start transaction
db.exec("BEGIN TRANSACTION");

try {
  // 1. Get all people
  console.log("📊 Reading all people from database...");
  const people = db.prepare("SELECT * FROM people").all();
  console.log(`   Found ${people.length} people\n`);

  // 2. Create mapping of old ID -> new ID
  console.log("🔄 Creating ID mapping...");
  const idMapping = new Map();
  const updates = [];

  for (const person of people) {
    const oldId = person.id;

    // Parse old format: nom_prenom (can have multiple underscores)
    const parts = oldId.split("_");
    if (parts.length < 2) {
      console.warn(`   ⚠️  Skipping invalid ID format: ${oldId}`);
      continue;
    }

    // Take first part as nom, join the rest as prenom
    const nom = parts[0];
    const prenom = parts.slice(1).join("_");
    const newId = `${prenom}.${nom}`;

    idMapping.set(oldId, newId);

    // Parse full name to extract first and last name
    let firstName = prenom.charAt(0).toUpperCase() + prenom.slice(1);
    let lastName = nom.toUpperCase();

    // Try to extract from existing name field if more accurate
    if (person.name) {
      const nameParts = person.name.split(" ");
      if (nameParts.length >= 2) {
        lastName = nameParts[0]; // First part is usually last name in UPPERCASE
        firstName = nameParts.slice(1).join(" "); // Rest is first name
      }
    }

    updates.push({
      oldId,
      newId,
      firstName,
      lastName,
      name: person.name,
      level: person.level,
      bio: person.bio,
      image_url: person.image_url,
    });
  }

  console.log(`   Created mapping for ${idMapping.size} IDs\n`);

  // 3. Create new people table
  console.log("📝 Creating new people table...");
  db.exec(`
    CREATE TABLE people_new (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      nickname TEXT,
      level INTEGER,
      bio TEXT,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. Insert updated people
  console.log("💾 Inserting updated people...");
  const insertPerson = db.prepare(`
    INSERT INTO people_new (id, first_name, last_name, nickname, level, bio, image_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertCount = 0;
  for (const update of updates) {
    insertPerson.run(
      update.newId,
      update.firstName,
      update.lastName,
      null, // nickname - will be populated later if needed
      update.level,
      update.bio,
      update.image_url,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    insertCount++;
    if (insertCount % 100 === 0) {
      console.log(`   Inserted ${insertCount}/${updates.length}...`);
    }
  }
  console.log(`   ✅ Inserted ${insertCount} people\n`);

  // 5. Update relationships table
  console.log("🔗 Updating relationships...");
  const relationships = db.prepare("SELECT * FROM relationships").all();

  db.exec(`
    CREATE TABLE relationships_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'parrainage',
      year INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES people(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);

  const insertRel = db.prepare(`
    INSERT INTO relationships_new (source_id, target_id, type, year, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let relCount = 0;
  let skippedRel = 0;
  for (const rel of relationships) {
    const newSourceId = idMapping.get(rel.source_id);
    const newTargetId = idMapping.get(rel.target_id);

    if (newSourceId && newTargetId) {
      insertRel.run(
        newSourceId,
        newTargetId,
        rel.type,
        rel.year,
        rel.notes,
        rel.created_at,
      );
      relCount++;
    } else {
      skippedRel++;
      if (skippedRel <= 10) {
        // Only show first 10 errors
        console.warn(
          `   ⚠️  Skipped relationship: ${rel.source_id} -> ${rel.target_id}`,
        );
      }
    }
  }
  console.log(
    `   ✅ Updated ${relCount} relationships (${skippedRel} skipped)\n`,
  );

  // 6. Update external_links table if exists
  console.log("🔗 Updating external links...");
  try {
    const links = db.prepare("SELECT * FROM external_links").all();

    db.exec(`
      CREATE TABLE external_links_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        label TEXT,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
      )
    `);

    const insertLink = db.prepare(`
      INSERT INTO external_links_new (person_id, type, url, label, display_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    let linkCount = 0;
    for (const link of links) {
      const newId = idMapping.get(link.person_id);
      if (newId) {
        insertLink.run(
          newId,
          link.type,
          link.url,
          link.label || null,
          link.display_order || 0,
        );
        linkCount++;
      }
    }
    console.log(`   ✅ Updated ${linkCount} external links\n`);
  } catch (error) {
    console.log("   ℹ️  No external_links table found\n");
  }

  // 7. Update associations table if exists
  console.log("🏛️  Updating associations...");
  try {
    const assocs = db.prepare("SELECT * FROM associations").all();

    db.exec(`
      CREATE TABLE associations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
      )
    `);

    const insertAssoc = db.prepare(`
      INSERT INTO associations_new (person_id, name, role)
      VALUES (?, ?, ?)
    `);

    let assocCount = 0;
    for (const assoc of assocs) {
      const newId = idMapping.get(assoc.person_id);
      if (newId) {
        insertAssoc.run(newId, assoc.name, assoc.role);
        assocCount++;
      }
    }
    console.log(`   ✅ Updated ${assocCount} associations\n`);
  } catch (error) {
    console.log("   ℹ️  No associations table found\n");
  }

  // 8. Drop old tables and rename new ones (need to handle views)
  console.log("🔄 Replacing old tables with new ones...");

  // Drop views that depend on tables first
  db.exec("DROP VIEW IF EXISTS v_people_complete");
  db.exec("DROP VIEW IF EXISTS v_relationships_detailed");
  db.exec("DROP TABLE IF EXISTS people_fts");

  db.exec("DROP TABLE IF EXISTS people");
  db.exec("ALTER TABLE people_new RENAME TO people");

  db.exec("DROP TABLE IF EXISTS relationships");
  db.exec("ALTER TABLE relationships_new RENAME TO relationships");

  try {
    db.exec("DROP TABLE IF EXISTS external_links");
    db.exec("ALTER TABLE external_links_new RENAME TO external_links");
  } catch (e) {}

  try {
    db.exec("DROP TABLE IF EXISTS associations");
    db.exec("ALTER TABLE associations_new RENAME TO associations");
  } catch (e) {}

  // 9. Recreate indexes
  console.log("📇 Recreating indexes...");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_people_level ON people(level);
    CREATE INDEX IF NOT EXISTS idx_people_last_name ON people(last_name);
    CREATE INDEX IF NOT EXISTS idx_people_first_name ON people(first_name);
    CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
  `);

  // Commit transaction
  db.exec("COMMIT");

  // Re-enable foreign keys
  db.pragma("foreign_keys = ON");

  console.log("\n✅ Migration completed successfully!\n");

  // Show sample results
  console.log("📋 Sample of migrated data:");
  const sample = db
    .prepare("SELECT id, first_name, last_name FROM people LIMIT 5")
    .all();
  console.table(sample);

  // Verify jolan.boudin exists
  console.log("\n🔍 Checking for jolan.boudin...");
  const jolan = db
    .prepare("SELECT * FROM people WHERE id = 'jolan.boudin'")
    .get();
  if (jolan) {
    console.log("✅ Found jolan.boudin:");
    console.log(jolan);
  } else {
    console.log("❌ jolan.boudin not found");
    const jolanSearch = db
      .prepare(
        "SELECT * FROM people WHERE first_name LIKE '%jolan%' OR last_name LIKE '%boudin%'",
      )
      .all();
    console.log("Similar entries:", jolanSearch);
  }
} catch (error) {
  console.error("\n❌ Migration failed:", error);
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
