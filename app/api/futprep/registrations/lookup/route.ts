import { NextResponse } from "next/server";
import { getFutprepRegistrationStatus } from "@/db/registrations";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 8;
const attemptsByIp = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string) {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry || entry.resetAt < now) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { referenceCode?: string; childDob?: string };
  const referenceCode = typeof body.referenceCode === "string" ? body.referenceCode.trim() : "";
  const childDob = typeof body.childDob === "string" ? body.childDob.trim() : "";

  if (!referenceCode || !childDob) {
    return NextResponse.json({ error: "Enter the registration code and date of birth." }, { status: 400 });
  }

  try {
    const status = await getFutprepRegistrationStatus(referenceCode, childDob);
    if (!status) {
      return NextResponse.json({ error: "We couldn't find a registration matching that code and date of birth." }, { status: 404 });
    }
    return NextResponse.json({ status });
  } catch (error) {
    console.error("Futprep registration lookup error", error);
    return NextResponse.json({ error: "Lookup is temporarily unavailable." }, { status: 500 });
  }
}
