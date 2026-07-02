import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { recalculatePositions } from "$lib/server/database";
import { m } from "$lib/paraglide/messages";

/**
 * Admin-triggered positions recompute. Runs the layout synchronously and returns
 * its outcome (positioned/total counts or the failure detail) so the admin can
 * SEE whether it worked, instead of the fire-and-forget path that used to fail
 * silently. Also usable as a manual "fix the map" button.
 */
export const POST: RequestHandler = async ({ locals }) => {
  if (locals.user?.role !== "admin") {
    return json({ error: m.api_admin_only() }, { status: 403 });
  }
  try {
    const status = await recalculatePositions();
    return json({ success: true, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Admin] Manual position recompute failed:", message);
    return json({ success: false, error: message }, { status: 500 });
  }
};
