import { NextRequest, NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { createInterestSubmission } from "@/db/interest";
import { isInterestCategory } from "@/lib/interestCategories";

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

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function utmRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && key.length <= 40) out[key.slice(0, 40)] = raw.trim().slice(0, 200);
  }
  return out;
}

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["category", "name", "email", "phone", "note", "utm"]);

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body: Record<string, unknown> | null = read.value;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const category = str(b.category, 20);
  if (!isInterestCategory(category)) {
    return NextResponse.json({ error: "Choose a valid category." }, { status: 400 });
  }

  const name = str(b.name, 120);
  const email = str(b.email, 180);
  const phone = str(b.phone, 40);
  if (!name && !email && !phone) {
    return NextResponse.json({ error: "Leave a name, email or phone so we can reach you." }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address, or leave it blank." }, { status: 400 });
  }

  try {
    const result = await createInterestSubmission({
      category,
      name,
      email,
      phone,
      note: str(b.note, 1000),
      utm: utmRecord(b.utm),
    });
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    console.error("Interest submission error", error);
    return NextResponse.json({ error: "Could not save this. Please try again." }, { status: 500 });
  }
}
