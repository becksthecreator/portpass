import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { CLAIM_COOKIE, CLAIM_COOKIE_SECONDS } from "@/lib/claimCookie";

const limited = createRateLimiter(20, 10 * 60_000);

// The first step of claiming a business (brief 08, 1.2): the owner pressed
// "Continue" on their claim link without being signed in. The link's token
// goes into a short-lived cookie and they are sent to make an account or
// sign in, then back to /claim/continue. Nothing is granted here: the
// token is checked, and used, only by POST /api/claim once they are signed in.
export async function POST(request: Request) {
  const back = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  if (limited(clientIp(request))) return back("/login");
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  if (!/^[a-f0-9]{48}$/.test(token)) return back("/login");
  const next = encodeURIComponent("/claim/continue");
  // Sign-up sends a code to a new address and to one that already has an
  // account, so it is the default; /login refuses an address it doesn't know.
  const response = back(form?.get("via") === "login" ? `/login?next=${next}` : `/signup?as=customer&next=${next}`);
  response.cookies.set({ name: CLAIM_COOKIE, value: token, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/claim", maxAge: CLAIM_COOKIE_SECONDS });
  return response;
}
