import { NextResponse } from "next/server";
import { destinationsFor } from "@/lib/auth/routing";
import { getSession, initialsFor } from "@/lib/auth/session";

// @public-route: answers "who am I" for the header; returns signedIn:false to anyone else.
// Fetched client-side by the header so statically rendered pages stay
// static; nothing sensitive is in here beyond what the signed-in person
// can already see about themselves.
export async function GET() {
  const session = await getSession();
  const body = session
    ? {
        signedIn: true,
        name: session.profile?.fullName ?? session.email ?? "",
        initials: initialsFor(session),
        destinations: destinationsFor(session),
      }
    : { signedIn: false };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
