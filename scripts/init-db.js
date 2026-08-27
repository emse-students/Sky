#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { Database } from "bun:sqlite";

const DB_PATH = path.join(process.cwd(), "database", "sky.db");
const SCHEMA_PATH = path.join(process.cwd(), "database", "schema.sql");

console.log("🚀 Initialisation de la base de données Sky...");
console.log(`   Database: ${DB_PATH}`);

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

if (fs.existsSync(DB_PATH)) {
  console.log("⚠️  Base de données déjà existante.");
  console.log("Script d'initialisation annulé.");
  process.exit(0);
}

const db = new Database(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");

if (fs.existsSync(SCHEMA_PATH)) {
  console.log("📄 Application du schéma...");
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);
  console.log("✅ Schéma appliqué.");
} else {
  console.error("❌ Schéma introuvable:", SCHEMA_PATH);
  process.exit(1);
}

console.log("✅ Initialisation terminée.");
