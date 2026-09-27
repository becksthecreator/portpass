import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { LAST_CHOICE_COOKIE } from "@/lib/auth/routing";
import { createAuthClient } from "@/lib/auth/server";

// @public-route: signing out with no session is a harmless no-op.
export async function POST() {
  try {
    const client = await createAuthClient();
    // Server-side revocation, not just cookie clearing: every device.
    await client.auth.signOut({ scope: "global" });
  } catch (error) {
    console.error("auth/signout", error);
  }
  (await cookies()).delete(LAST_CHOICE_COOKIE);
  return NextResponse.json({ ok: true });
}
