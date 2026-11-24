import { NextResponse } from "next/server";
import { futprepFamilyFor } from "@/db/futprepFamily";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { getSession } from "@/lib/auth/session";

// "Use my details" on the FutPrep register (V4, PR 2). Only for a parent
// signed in to PortPass: the email-code (or Google) sign-in is the
// one-time code, so details go only to someone who has proved they own the
// email. Never looked up from a typed address, so nobody can learn who is
// registered. Returns what Privacy v3 names (lib/futprepFamily.ts) and
// nothing about health, emergency contacts or pickup (rule 3).
const perAccount = createRateLimiter(20, 10 * 60 * 1000);
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to use your details." }, { status: 401, headers: NO_STORE });
  if (perAccount(session.userId)) return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429, headers: NO_STORE });
  try {
    return NextResponse.json(await futprepFamilyFor(session.email), { headers: NO_STORE });
  } catch (error) {
    console.error("futprep family error", (error as { code?: string } | null)?.code ?? "");
    return NextResponse.json({ error: "Your details aren't available right now. Fill the form in instead." }, { status: 503, headers: NO_STORE });
  }
}
