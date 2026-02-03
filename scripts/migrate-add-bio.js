import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "../database/sky.db");

if (!fs.existsSync(dbPath)) {
  console.error("Database not found at", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

try {
  console.log("Adding bio column to people table...");
  try {
    db.prepare("ALTER TABLE people ADD COLUMN bio TEXT").run();
    console.log("Bio column added.");
  } catch (error) {
    if (error.message.includes("duplicate column name: bio")) {
      console.log("Column bio already exists.");
    } else {
      throw error;
    }
  }

  console.log("Adding image_url column to people table...");
  try {
    db.prepare("ALTER TABLE people ADD COLUMN image_url TEXT").run();
    console.log("Image_url column added.");
  } catch (error) {
    if (error.message.includes("duplicate column name: image_url")) {
      console.log("Column image_url already exists.");
    } else {
      throw error;
    }
  }

  console.log("Done.");
} catch (error) {
  console.error("Migration failed:", error);
}
