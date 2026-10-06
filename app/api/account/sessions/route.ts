import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { endOwnSessions } from "@/db/sessions";
import { requireSignedInApi } from "@/lib/auth/guards";
import { LAST_CHOICE_COOKIE } from "@/lib/auth/routing";
import { createAuthClient } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// My account -> Security -> "Sign out everywhere" (Brief 21, part C). Ends
// every session this person has, on every device, then clears the cookies
// on this one. Signed in only: a stranger cannot sign anyone out.
export async function DELETE() {
  const auth = await requireSignedInApi();
  if (!auth.ok) return auth.response;
  let ended: number;
  try {
    ended = await endOwnSessions(auth.session.userId);
  } catch (error) {
    console.error("account/sessions", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not sign you out everywhere. Try again." }, { status: 500 });
  }
  // The sessions are gone on the server; this clears what the browser holds.
  try {
    const client = await createAuthClient();
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Nothing to clear, or already cleared.
  }
  (await cookies()).delete(LAST_CHOICE_COOKIE);
  return NextResponse.json({ ok: true, ended });
}
