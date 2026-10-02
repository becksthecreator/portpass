import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Who may open a PortPass invoice (brief 09 acceptance): the business it
// was sent to (owners and admins, never staff) and platform staff. Another
// business's owner gets "not found", from the API itself.
const state = vi.hoisted(() => ({
  guard: { ok: true, session: { platformRole: null as string | null } } as { ok: boolean; session?: { platformRole: string | null }; response?: unknown },
  asked: [] as Array<{ org: unknown; min: unknown }>,
  invoice: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOrgRoleApi: vi.fn(async (org: unknown, min: unknown) => {
    state.asked.push({ org, min });
    return state.guard;
  }),
}));
vi.mock("@/db/billing", () => ({
  getInvoice: vi.fn(async () => state.invoice),
  getAccount: vi.fn(async () => null),
  getBankDetails: vi.fn(async () => ({ bank: "TEST Bank", accountName: "PortPass Bahamas Technologies", accountNumber: "0000000", branch: "TEST Main" })),
}));

import { GET } from "./route";

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 9, number: "PP-2026-009", organizationId: 5, organizationName: "TEST delete Club", status: "sent", issuedOn: "2026-11-05", dueOn: "2026-11-19", periodStart: "2026-11-05", periodEnd: "2026-12-04",
  subtotalCents: 6500, vatCents: 0, totalCents: 6500, paidCents: 0, lines: [{ id: 1, description: "TEST plan line", qty: 1, unitCents: 6500, amountCents: 6500 }], receipts: [], ...over,
});
const open = (org: string, id: string) => GET(new Request(`https://portpassbahamas.com/api/business/orgs/${org}/invoices/${id}/pdf`), { params: Promise.resolve({ id: org, invoiceId: id }) });

beforeEach(() => {
  state.guard = { ok: true, session: { platformRole: null } };
  state.asked = [];
  state.invoice = invoice();
});

describe("opening an invoice's PDF", () => {
  it("asks for an owner or admin of that business, and gives them the PDF", async () => {
    const response = await open("5", "9");
    expect(state.asked).toEqual([{ org: 5, min: "org_admin" }]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer()).toString("latin1").startsWith("%PDF-1.4")).toBe(true);
  });

  it("passes on the guard's refusal: staff, or someone from another business", async () => {
    state.guard = { ok: false, response: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
    expect((await open("5", "9")).status).toBe(403);
  });

  it("never serves another business's invoice through this business's address", async () => {
    state.invoice = invoice({ organizationId: 6 });
    expect((await open("5", "9")).status).toBe(404);
  });

  it("keeps a draft to platform staff", async () => {
    state.invoice = invoice({ status: "draft" });
    expect((await open("5", "9")).status).toBe(404);
    state.guard = { ok: true, session: { platformRole: "platform_owner" } };
    expect((await open("5", "9")).status).toBe(200);
  });

  it("answers not found for an address that isn't a number", async () => {
    expect((await open("abc", "9")).status).toBe(404);
    expect((await open("5", "0")).status).toBe(404);
    expect(state.asked).toEqual([]);
  });
});
