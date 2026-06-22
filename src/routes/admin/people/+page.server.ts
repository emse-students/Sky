import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  const user = locals.user;
  if (!user || user.role !== "admin") {
    throw redirect(302, "/");
  }
  return {};
};
