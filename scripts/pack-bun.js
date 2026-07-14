#!/usr/bin/env node

import fs from "fs";
import path from "path";
import * as tar from "tar";

const pkgPath = path.resolve(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version || "0.0.0";
const name = pkg.name || "package";

const outDir = path.resolve(process.cwd(), "build", "artifacts");
await fs.promises.mkdir(outDir, { recursive: true });

const filename = `${name.replace(/[^a-z0-9.-]/gi, "_")}-${version}-full.tgz`;
const outPath = path.join(outDir, filename);

console.log("📦 Building the full application package...");
console.log(`📍 Destination: ${outPath}`);
console.log("");

const buildDir = path.resolve(process.cwd(), "build");
if (!fs.existsSync(buildDir)) {
  console.error('❌ build/ does not exist. Run "npm run build" first.');
  process.exit(1);
}
console.log("✅ build/ found");

const dataDir = path.resolve(process.cwd(), "database");
if (fs.existsSync(dataDir)) {
  console.log("✅ database/ found");
} else {
  console.warn(
    "⚠️  database/ not found - the package will not include a database",
  );
}

const envFile = path.resolve(process.cwd(), ".env");
const includeEnv =
  String(process.env.PACK_INCLUDE_ENV || "").toLowerCase() === "true";
if (fs.existsSync(envFile) && includeEnv) {
  console.log(
    "✅ .env found and inclusion requested via PACK_INCLUDE_ENV=true",
  );
} else if (fs.existsSync(envFile) && !includeEnv) {
  console.warn(
    "⚠️  .env found but NOT included in the package (security). To include it, export PACK_INCLUDE_ENV=true before running the script.",
  );
} else {
  console.warn(
    "⚠️  .env not found - the package will not include configuration",
  );
}

console.log("✅ package.json");

const readmeFile = path.resolve(process.cwd(), "README.md");
if (fs.existsSync(readmeFile)) {
  console.log("✅ README.md");
}

// Scripts (for use on the target machine)
const scriptsDir = path.resolve(process.cwd(), "scripts");
if (fs.existsSync(scriptsDir)) {
  console.log("✅ scripts/");
}

console.log("");
console.log("🔄 Creating the archive...");

try {
  await tar.create(
    {
      gzip: true,
      file: outPath,
      cwd: process.cwd(),
      filter: (p) => {
        // Normalise the path for comparison
        const normalizedPath = p.replace(/\\/g, "/").replace(/^\.\//, "");

        // Exclude temporary or bulky data directories
        const excludes = ["build/artifacts", "database/backups"];

        if (
          excludes.some(
            (ex) =>
              normalizedPath === ex || normalizedPath.startsWith(ex + "/"),
          )
        ) {
          return false;
        }

        // Exclude transient SQLite files (WAL, SHM)
        if (
          normalizedPath.endsWith("-wal") ||
          normalizedPath.endsWith("-shm")
        ) {
          return false;
        }

        return true;
      },
    },
    [
      "build",
      fs.existsSync(dataDir) ? "database" : null,
      fs.existsSync(envFile) && includeEnv ? ".env" : null,
      "package.json",
      fs.existsSync(readmeFile) ? "README.md" : null,
      fs.existsSync(scriptsDir) ? "scripts" : null,
    ].filter(Boolean),
  );

  const stats = fs.statSync(outPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log("");
  console.log("✅ Package created successfully!");
  console.log(`📦 File: ${filename}`);
  console.log(`📏 Size: ${sizeMB} MB`);
  console.log(`📍 Location: ${outPath}`);
  console.log("");
  console.log("💡 To deploy on another machine:");
  console.log("   1. Copy the .tgz file");
  console.log("   2. Extract: tar -xzf " + filename);
  console.log("   3. Install dependencies: bun install --production");
  console.log("   4. Configure .env if needed");
  console.log("   5. Start: bun run build/index.js");
} catch (error) {
  console.error("❌ Failed to create the package:", error.message);
  process.exit(1);
}
