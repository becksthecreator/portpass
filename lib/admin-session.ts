import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PORTPASS_ADMIN_COOKIE, verifyAdminToken } from "./admin-auth";

export async function currentPortpassAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get(PORTPASS_ADMIN_COOKIE)?.value);
}

export async function requirePortpassAdmin(returnTo: string) {
  if (await currentPortpassAdmin()) return;
  redirect(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
}
