#!/usr/bin/env node
/**
 * Rebuild FTS (Full-Text Search) index for people table
 * Run this when you get "fts5: missing row" errors
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "../database/sky.db");

if (!fs.existsSync(dbPath)) {
  console.error("❌ Database not found at", dbPath);
  process.exit(1);
}

console.log("🔄 Rebuilding FTS index...");

const db = new Database(dbPath);

try {
  // Drop existing FTS table
  console.log("   Dropping old FTS index...");
  db.prepare("DROP TABLE IF EXISTS people_fts").run();

  // Recreate FTS table
  console.log("   Creating new FTS index...");
  db.prepare(`
    CREATE VIRTUAL TABLE people_fts USING fts5(
      id,
      first_name,
      last_name,
      content='people',
      content_rowid='rowid'
    )
  `).run();

  // Rebuild FTS index from people table
  console.log("   Populating FTS index...");
  db.prepare(`
    INSERT INTO people_fts(rowid, id, first_name, last_name)
    SELECT rowid, id, first_name, last_name FROM people
  `).run();

  const count = db.prepare("SELECT COUNT(*) as count FROM people_fts").get();
  console.log(`✅ FTS index rebuilt successfully! Indexed ${count.count} people.`);
} catch (error) {
  console.error("❌ Error rebuilding FTS index:", error);
  process.exit(1);
} finally {
  db.close();
}
