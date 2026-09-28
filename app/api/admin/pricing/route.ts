import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { logAudit } from "@/db/audit";
import { getPlan, listAddons, PRICING_TAG, updateAddon, updatePlan, type AddonPatch, type PlanPatch } from "@/db/pricing";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";

// Admin → Settings → Prices (pricing brief, 28 Sept). One PATCH per row,
// audit-logged with the full before/after, then the "pricing" cache tag
// and the pages that show prices are revalidated so the change is live
// on the next request. Rows are never created or deleted from here: the
// codes are referenced by applications (and, in part 2, billing).
const limited = createRateLimiter(60, 15 * 60_000);

const MAX_CENTS = 10_000_000; // $100,000: a typo guard, not a price policy.

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

function cents(value: unknown): number | undefined | false {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_CENTS ? value : false;
}

type Body = { target?: unknown; code?: unknown; patch?: Record<string, unknown> };

function planPatch(p: Record<string, unknown>): PlanPatch | string {
  const patch: PlanPatch = {};
  const name = text(p.name, 40);
  if (name !== undefined) {
    if (name.length < 2) return "Give the plan a name (at least 2 characters).";
    patch.name = name;
  }
  const monthly = cents(p.monthlyCents);
  if (monthly === false) return "The monthly price is whole cents, from $0 up.";
  if (monthly !== undefined) patch.monthlyCents = monthly;
  if (p.annualMonthsCharged !== undefined) {
    const m = p.annualMonthsCharged;
    if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 12) return "Annual billing charges between 1 and 12 months.";
    patch.annualMonthsCharged = m;
  }
  if (p.commissionBps !== undefined) {
    const b = p.commissionBps;
    if (typeof b !== "number" || !Number.isInteger(b) || b < 0 || b > 10000) return "Commission is in basis points, 0 to 10000 (100%).";
    patch.commissionBps = b;
  }
  if (p.blurb !== undefined) {
    if (p.blurb === null) patch.blurb = null;
    else {
      const blurb = text(p.blurb, 120);
      if (blurb === undefined) return "The blurb is text.";
      patch.blurb = blurb || null;
    }
  }
  if (p.features !== undefined) {
    if (!Array.isArray(p.features) || p.features.length > 40 || !p.features.every((f) => typeof f === "string" && f.trim().length > 0 && f.length <= 80)) {
      return "Features are up to 40 short lines.";
    }
    patch.features = (p.features as string[]).map((f) => f.trim());
  }
  if (p.badge !== undefined) {
    if (p.badge === null) patch.badge = null;
    else {
      const badge = text(p.badge, 30);
      if (badge === undefined) return "The badge is text.";
      patch.badge = badge || null;
    }
  }
  if (p.isPublic !== undefined) {
    if (typeof p.isPublic !== "boolean") return "Public is on or off.";
    patch.isPublic = p.isPublic;
  }
  if (p.active !== undefined) {
    if (typeof p.active !== "boolean") return "Active is on or off.";
    patch.active = p.active;
  }
  return patch;
}

function addonPatch(p: Record<string, unknown>): AddonPatch | string {
  const patch: AddonPatch = {};
  const name = text(p.name, 40);
  if (name !== undefined) {
    if (name.length < 2) return "Give the add-on a name (at least 2 characters).";
    patch.name = name;
  }
  const amount = cents(p.amountCents);
  if (amount === false) return "The amount is whole cents, from $0 up.";
  if (amount !== undefined) patch.amountCents = amount;
  if (p.note !== undefined) {
    if (p.note === null) patch.note = null;
    else {
      const note = text(p.note, 80);
      if (note === undefined) return "The note is text.";
      patch.note = note || null;
    }
  }
  if (p.isPublic !== undefined) {
    if (typeof p.isPublic !== "boolean") return "Public is on or off.";
    patch.isPublic = p.isPublic;
  }
  if (p.status !== undefined) {
    if (p.status !== "adopted" && p.status !== "proposed") return "Status is adopted or proposed.";
    patch.status = p.status;
  }
  return patch;
}

function revalidatePrices() {
  revalidateTag(PRICING_TAG);
  for (const path of ["/pricing", "/business", "/apply"]) revalidatePath(path);
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.code !== "string" || !body.patch || typeof body.patch !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const code = body.code;

  if (body.target === "plan") {
    const before = await getPlan(code, { fresh: true });
    if (!before) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const patch = planPatch(body.patch);
    if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });
    if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    const after = await updatePlan(code, patch);
    await logAudit({ actorUserId: auth.session.userId, action: "pricing.plan.updated", targetTable: "pricing_plans", targetId: code, before, after });
    revalidatePrices();
    return NextResponse.json({ plan: after });
  }

  if (body.target === "addon") {
    const before = (await listAddons({ fresh: true })).find((a) => a.code === code);
    if (!before) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const patch = addonPatch(body.patch);
    if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });
    if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    const after = await updateAddon(code, patch);
    await logAudit({ actorUserId: auth.session.userId, action: "pricing.addon.updated", targetTable: "pricing_addons", targetId: code, before, after });
    revalidatePrices();
    return NextResponse.json({ addon: after });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
