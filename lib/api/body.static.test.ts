import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Every API route that reads a JSON body does so through lib/api/body.ts
// (a zod schema naming its fields; anything else refused), except the ones
// listed here, which still read request.json() themselves. The list is
// what was left on 6 Oct 2026 after Brief 21 part E moved every public
// (unauthenticated) route over. It can only shrink: a new route that reads
// a body any other way fails this test, and a route that has been moved
// over must be taken off the list.
const STILL_READS_JSON_ITSELF = new Set<string>([
  "app/api/account/profile/route.ts",
  "app/api/admin/billing/accounts/[orgId]/route.ts",
  "app/api/admin/billing/bank/route.ts",
  "app/api/admin/billing/fees/route.ts",
  "app/api/admin/billing/invoices/[id]/route.ts",
  "app/api/admin/billing/invoices/route.ts",
  "app/api/admin/bookings/registrations/[id]/reveal/route.ts",
  "app/api/admin/businesses/[id]/route.ts",
  "app/api/admin/businesses/route.ts",
  "app/api/admin/content/route.ts",
  "app/api/admin/guides/[id]/route.ts",
  "app/api/admin/guides/route.ts",
  "app/api/admin/leads/[id]/route.ts",
  "app/api/admin/leads/import/route.ts",
  "app/api/admin/leads/route.ts",
  "app/api/admin/leads/search/route.ts",
  "app/api/admin/mfa/verify/route.ts",
  "app/api/admin/people/route.ts",
  "app/api/admin/perks/[id]/route.ts",
  "app/api/admin/pricing/route.ts",
  "app/api/admin/sections/[id]/route.ts",
  "app/api/admin/sections/route.ts",
  "app/api/admin/shop/products/[productId]/route.ts",
  "app/api/admin/sponsors/route.ts",
  "app/api/admin/tools/[id]/route.ts",
  "app/api/admin/tools/route.ts",
  "app/api/applications/[id]/route.ts",
  "app/api/business/orgs/[id]/attendance/route.ts",
  "app/api/business/orgs/[id]/bookings/[bookingId]/route.ts",
  "app/api/business/orgs/[id]/images/route.ts",
  "app/api/business/orgs/[id]/invites/route.ts",
  "app/api/business/orgs/[id]/offerings/route.ts",
  "app/api/business/orgs/[id]/payment-methods/route.ts",
  "app/api/business/orgs/[id]/perks/[perkId]/route.ts",
  "app/api/business/orgs/[id]/perks/check/route.ts",
  "app/api/business/orgs/[id]/perks/redeem/route.ts",
  "app/api/business/orgs/[id]/perks/route.ts",
  "app/api/business/orgs/[id]/programs/route.ts",
  "app/api/business/orgs/[id]/registrations/[registrationId]/route.ts",
  "app/api/business/orgs/[id]/route.ts",
  "app/api/business/orgs/[id]/shop/drops/[dropId]/release/route.ts",
  "app/api/business/orgs/[id]/shop/drops/[dropId]/route.ts",
  "app/api/business/orgs/[id]/shop/drops/route.ts",
  "app/api/business/orgs/[id]/shop/products/[productId]/route.ts",
  "app/api/business/orgs/[id]/shop/products/route.ts",
  "app/api/business/orgs/[id]/shop/reservations/[reservationId]/route.ts",
  "app/api/business/orgs/[id]/shop/route.ts",
  "app/api/business/orgs/route.ts",
  "app/api/claim/route.ts",
  "app/api/demo/attendance/route.ts",
  "app/api/demo/registrations/[registrationId]/route.ts",
  "app/api/demo/requests/route.ts",
  "app/api/futprep/private-sessions/[id]/payments/route.ts",
  "app/api/futprep/private-sessions/[id]/route.ts",
  "app/api/futprep/programs/route.ts",
  "app/api/futprep/staff/accounts/route.ts",
  "app/api/futprep/staff/attendance/route.ts",
  "app/api/futprep/staff/bootstrap-admin/route.ts",
  "app/api/futprep/staff/change-pin/route.ts",
  "app/api/futprep/staff/coach-slots/route.ts",
  "app/api/futprep/staff/pay/field-cost/route.ts",
  "app/api/futprep/staff/pay/mark-paid/route.ts",
  "app/api/futprep/staff/pay/rates/route.ts",
  "app/api/futprep/staff/payments/[id]/route.ts",
  "app/api/futprep/staff/payments/route.ts",
  "app/api/futprep/staff/registrations/[id]/detail/route.ts",
  "app/api/futprep/staff/registrations/[id]/route.ts",
  "app/api/futprep/staff/registrations/route.ts",
  "app/api/futprep/staff/return-links/route.ts",
  "app/api/futprep/staff/sessions/[id]/coaches/route.ts",
  "app/api/futprep/staff/sessions/[id]/plan/route.ts",
  "app/api/futprep/staff/sessions/[id]/staff/route.ts",
  "app/api/futprep/staff/sessions/[id]/work-log/route.ts",
  "app/api/futprep/staff/teamsnap-import/route.ts",
  "app/api/futprep/team/photo/route.ts",
  "app/api/futprep/team/route.ts",
  "app/api/payments/orgs/[id]/requests/[requestId]/payments/route.ts",
  "app/api/payments/orgs/[id]/requests/[requestId]/route.ts",
  "app/api/payments/orgs/[id]/requests/route.ts",
  "app/api/payments/orgs/[id]/settings/route.ts",
  "app/api/payments/orgs/[id]/team/route.ts",
  "app/api/weddings/admin/accounts/route.ts",
  "app/api/weddings/admin/availability/route.ts",
  "app/api/weddings/admin/content/route.ts",
  "app/api/weddings/admin/gallery/route.ts",
  "app/api/weddings/admin/leads/[id]/complete/route.ts",
  "app/api/weddings/admin/leads/[id]/notes/route.ts",
  "app/api/weddings/admin/leads/[id]/route.ts",
  "app/api/weddings/admin/packages/route.ts",
  "app/api/weddings/staff/bootstrap-admin/route.ts",
  "app/api/weddings/staff/change-pin/route.ts",
]);

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /^route\.tsx?$/.test(name) ? [full] : [];
  });
}

const repoPath = (file: string) => relative(process.cwd(), file).split(sep).join("/");

describe("API routes read their JSON body through lib/api/body.ts", () => {
  const routes = walk(join(process.cwd(), "app", "api"));
  const readsItself = routes.filter((file) => {
    const source = readFileSync(file, "utf8");
    return /\b(request|req)\.json\(\)/.test(source) && !/\breadJson\(/.test(source);
  }).map(repoPath);

  it("every route not on the list uses readJson", () => {
    const unexpected = readsItself.filter((route) => !STILL_READS_JSON_ITSELF.has(route)).sort();
    expect(unexpected, `reads request.json() itself: ${unexpected.join(", ")}. Use readJson with a bodyOf([...]) schema (lib/api/body.ts).`).toEqual([]);
  });

  it("the list holds only routes that still read a body themselves (take moved ones off)", () => {
    const current = new Set(readsItself);
    const stale = [...STILL_READS_JSON_ITSELF].filter((route) => !current.has(route)).sort();
    expect(stale, `listed but no longer reads request.json() itself: ${stale.join(", ")}`).toEqual([]);
  });

  it("every public route reads its body through readJson, with a schema", () => {
    // The staff bootstrap routes are a one-time door (createBootstrapAdmin
    // refuses once any account exists), so they count as guarded here.
    const guard = /\brequire(SignedIn|PlatformRole|OrgRole|Admin|Demo)(Api)?\s*\(|\bpaymentsApiAccess\s*\(|requireFutprepStaff|currentFutprepStaff|currentWeddingStaff|requireWeddingStaff|cronGate|resolvePayAccess|verifyResendSignature|createBootstrapAdmin|[bB]ootstrapw*Admin/;
    for (const file of routes) {
      const source = readFileSync(file, "utf8");
      if (guard.test(source) || !/\b(request|req)\.json\(\)/.test(source)) continue;
      expect(source, `${repoPath(file)} is public and reads a body: it must use readJson`).toMatch(/\breadJson\(/);
      expect(source, `${repoPath(file)} has no bodyOf([...]) schema`).toMatch(/bodyOf\(\[/);
    }
  });
});
