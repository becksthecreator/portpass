// @public-route: the first button on /login and /signup ("Continue with
// Google", speed & sign-in brief, 29 Sept, 2.2). Starts Supabase Auth's
// Google OAuth flow (PKCE; the verifier lives in a cookie the ssr client
// sets here) and sends the browser to Google. Google itself is switched
// on by Antonio in the Supabase dashboard; until then this sends the
// visitor back to the sign-in page with a plain message (Supabase would
// otherwise show an error page of its own), never a 500.
import { NextResponse } from "next/server";
import { googleSignInEnabled } from "@/lib/auth/google";
import { safeNext } from "@/lib/auth/next";
import { createAuthClient } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"), "");
  const intent = url.searchParams.get("intent") === "business" ? "business" : url.searchParams.get("intent") === "customer" ? "customer" : "";
  const mode = url.searchParams.get("mode") === "signup" ? "signup" : "login";
  const back = new URL(mode === "signup" ? "/signup" : "/login", url.origin);
  if (next) back.searchParams.set("next", next);

  if (!(await googleSignInEnabled())) {
    back.searchParams.set("error", "google_unavailable");
    return NextResponse.redirect(back);
  }

  let client;
  try {
    client = await createAuthClient();
  } catch {
    back.searchParams.set("error", "google_unavailable");
    return NextResponse.redirect(back);
  }

  const callback = new URL("/api/auth/callback", url.origin);
  if (next) callback.searchParams.set("next", next);
  if (intent) callback.searchParams.set("intent", intent);

  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    console.warn("auth_google_failed", { code: error?.code, status: error?.status });
    back.searchParams.set("error", "google_unavailable");
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(data.url);
}
