import { NextResponse } from "next/server";
import { completeFutprepRegistration, getFutprepPendingRegistration } from "@/db/registrations";

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

const limits: Record<string, number> = {
  gender: 40, relationship: 60, parentName: 120, parentEmail: 180, parentPhone: 40,
  emergencyContactName: 120, emergencyContactPhone: 40, authorizedPickup: 1000,
  allergies: 1000, medicalConditions: 1000, medications: 1000, specialNeeds: 1500,
  photoConsent: 10, paymentFrequency: 20, paymentMethod: 30, signatureName: 120,
};

function clean(body: Record<string, unknown>, field: string) {
  return (typeof body[field] === "string" ? body[field].trim() : "").slice(0, limits[field] ?? 250);
}

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const { code } = await context.params;
  const registration = await getFutprepPendingRegistration(code);
  if (!registration) return NextResponse.json({ error: "We couldn't find a registration to complete for that code." }, { status: 404 });
  return NextResponse.json({ registration });
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const { code } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const childDob = clean(body, "childDob");
  const gender = clean(body, "gender");
  const emergencyContactName = clean(body, "emergencyContactName");
  const emergencyContactPhone = clean(body, "emergencyContactPhone");
  const photoConsent = clean(body, "photoConsent");
  const paymentFrequency = clean(body, "paymentFrequency");
  const paymentMethod = clean(body, "paymentMethod");
  const signatureName = clean(body, "signatureName");

  if (!childDob || !gender || !emergencyContactName || !emergencyContactPhone) {
    return NextResponse.json({ error: "Complete the child and emergency-contact details." }, { status: 400 });
  }
  if (!["yes", "no"].includes(photoConsent)) {
    return NextResponse.json({ error: "Choose a photo/video permission option." }, { status: 400 });
  }
  if (!["weekly", "term"].includes(paymentFrequency)) {
    return NextResponse.json({ error: "Choose a payment plan." }, { status: 400 });
  }
  if (!["cash", "bank_transfer", "online_banking"].includes(paymentMethod)) {
    return NextResponse.json({ error: "Choose a payment method." }, { status: 400 });
  }
  if (!signatureName) {
    return NextResponse.json({ error: "Enter the parent/guardian electronic signature." }, { status: 400 });
  }
  if (body.consentAccepted !== true) {
    return NextResponse.json({ error: "The parent/guardian consent box is required." }, { status: 400 });
  }

  try {
    const result = await completeFutprepRegistration({
      referenceCode: code,
      childDob,
      gender,
      relationship: clean(body, "relationship"),
      parentName: clean(body, "parentName"),
      parentEmail: clean(body, "parentEmail"),
      parentPhone: clean(body, "parentPhone"),
      emergencyContactName,
      emergencyContactPhone,
      allergies: clean(body, "allergies"),
      medicalConditions: clean(body, "medicalConditions"),
      medications: clean(body, "medications"),
      specialNeeds: clean(body, "specialNeeds"),
      authorizedPickup: clean(body, "authorizedPickup") || emergencyContactName,
      photoConsent: photoConsent as "yes" | "no",
      paymentFrequency: paymentFrequency as "weekly" | "term",
      paymentMethod: paymentMethod as "cash" | "bank_transfer" | "online_banking",
      signatureName,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "We couldn't find that registration." }, { status: 404 });
    if (message === "ALREADY_COMPLETE") return NextResponse.json({ error: "This registration has already been completed." }, { status: 409 });
    if (message === "AGE_MISMATCH") return NextResponse.json({ error: "That date of birth doesn't match this class's age range. Please contact Futprep on WhatsApp so a coach can confirm the right class." }, { status: 409 });
    console.error("Futprep registration completion error", error);
    return NextResponse.json({ error: "Could not complete this registration. Please try again." }, { status: 500 });
  }
}
