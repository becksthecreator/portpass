// @public-route: where Google sends the browser back. Exchanges the code
// for a session, runs the same first-sign-in bootstrap the email code
// does (profile, founder role, invites, person link), then lands the
// person where the email flow would (lib/auth/routing.ts).
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { bootstrapUser } from "@/lib/auth/bootstrap";
import { safeNext } from "@/lib/auth/next";
import { LAST_CHOICE_COOKIE, resolveDestination } from "@/lib/auth/routing";
import { createAuthClient } from "@/lib/auth/server";
import { sessionForUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "") || null;
  const intent = url.searchParams.get("intent") === "business" ? "business" : url.searchParams.get("intent") === "customer" ? "customer" : null;
  const back = new URL("/login", url.origin);
  if (next) back.searchParams.set("next", next);

  if (!code) {
    back.searchParams.set("error", "google_failed");
    return NextResponse.redirect(back);
  }

  let client;
  try {
    client = await createAuthClient();
  } catch {
    back.searchParams.set("error", "google_unavailable");
    return NextResponse.redirect(back);
  }

  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.warn("auth_google_failed", { stage: "exchange", code: error?.code, status: error?.status });
    back.searchParams.set("error", "google_failed");
    return NextResponse.redirect(back);
  }

  await bootstrapUser(data.user);
  const session = await sessionForUser({ id: data.user.id, email: data.user.email ?? null, phone: data.user.phone ?? null });
  const lastChoice = (await cookies()).get(LAST_CHOICE_COOKIE)?.value ?? null;
  const metaIntent = typeof data.user.user_metadata?.intent === "string" ? (data.user.user_metadata.intent as string) : null;
  const destination = resolveDestination(session, { next, lastChoice, intent: intent ?? metaIntent });
  return NextResponse.redirect(new URL(destination, url.origin));
}
