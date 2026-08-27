import type { RequestHandler } from "./$types";
import { writeFileSync, copyFileSync } from "fs";
import {
  DB_PATH,
  closeDatabase,
  recalculatePositions,
} from "$lib/server/database";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const POST: RequestHandler = async ({ request, locals }) => {
  // Check admin authorization
  if (locals.user?.role !== "admin") {
    return new Response("Unauthorized", { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("database") as File;

    if (!file) {
      return new Response("No file provided", { status: 400 });
    }

    // Create backup of current database
    const backupPath = `${DB_PATH}.backup-${Date.now()}`;
    copyFileSync(DB_PATH, backupPath);

    // Write new database. The module-level handle must be dropped first: it points
    // at the file being replaced, and every later query would run against the old
    // inode while the admin believes the import took effect.
    closeDatabase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    writeFileSync(DB_PATH, buffer);

    // Bring the imported file up to the schema the code expects, THEN verify it.
    // This used to run `migrate-add-bio.js` (deleted along with the column) and to
    // swallow every failure under a "non-fatal" catch, so an import whose
    // migrations had all failed still answered `success: true` and left the admin
    // with a base the app could not read. An import that cannot be migrated is a
    // failed import, and the backup taken above is what it falls back to.
    try {
      console.debug("[import] Running migrations on the imported database...");
      await execAsync("bun scripts/migrate-auth.js");
      await execAsync("bun scripts/migrate-drop-dead-schema.js");
      await execAsync("bun scripts/check-db-integrity.js");
      console.debug("[import] Migrations and integrity check passed");
    } catch (migrationError) {
      console.error(
        "[import] Migration or integrity check failed; restoring the backup:",
        migrationError,
      );
      copyFileSync(backupPath, DB_PATH);
      return new Response(
        JSON.stringify({ success: false, error: "migration_failed" }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

    // Recompute star positions for the freshly imported graph: without this the
    // positions.json is stale and any person absent from it is invisible on the
    // map. Non-fatal (the client also scatters unpositioned nodes as a safety net).
    try {
      console.debug("Recalculating positions for imported database...");
      await recalculatePositions();
    } catch (positionError) {
      console.error("Position recompute error (non-fatal):", positionError);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Import error:", error);
    return new Response("Import failed", { status: 500 });
  }
};
