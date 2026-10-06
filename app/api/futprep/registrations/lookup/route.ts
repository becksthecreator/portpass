import { NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
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

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["referenceCode", "childDob"]);

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body = read.value as { referenceCode?: string; childDob?: string };
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
