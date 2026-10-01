import { beforeEach, describe, expect, it, vi } from "vitest";

// Who may open a business's pages and APIs, and when the second sign-in
// step is demanded. A business's own members get in on their membership.
// PortPass staff get in on their platform role, and that door (through
// which a business's details, team and bank-transfer details can be
// changed) needs an authenticator code within the last 12 hours, exactly
// like the admin area.
const state = vi.hoisted(() => ({
  session: null as null | { userId: string; platformRole: string | null; memberships: Array<{ organizationId: number; role: string }> },
  step: { aal2: false, windowOpen: false, enrolled: true, factorId: "f1" as string | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("./session", () => ({ getSession: vi.fn(async () => state.session) }));
vi.mock("./admin", () => ({ ADMIN_MFA_PATH: "/admin/verify", adminStepUp: vi.fn(async () => state.step) }));
vi.mock("@/db/accounts", () => ({
  getOrganizationSummary: vi.fn(async (ref: number | { slug: string }) => (ref === 7 || (typeof ref === "object" && ref.slug === "futprep") ? { id: 7, slug: "futprep", name: "Futprep Athletics" } : null)),
  canViewMedical: (membership: { role: string }) => membership.role === "org_owner" || membership.role === "org_admin",
}));

import { requireOrgRole, requireOrgRoleApi } from "./guards";

const owner = { userId: "u-owner", platformRole: null, memberships: [{ organizationId: 7, role: "org_owner" }] };
const stranger = { userId: "u-stranger", platformRole: null, memberships: [] };
const platformAdmin = { userId: "u-staff", platformRole: "platform_admin", memberships: [] };
const founderWhoOwns = { userId: "u-founder", platformRole: "platform_owner", memberships: [{ organizationId: 7, role: "org_owner" }] };

beforeEach(() => {
  state.session = null;
  state.step = { aal2: false, windowOpen: false, enrolled: true, factorId: "f1" };
});

describe("requireOrgRoleApi", () => {
  it("lets a business's own owner in without any second step", async () => {
    state.session = owner;
    const result = await requireOrgRoleApi(7, "org_owner");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result).toMatchObject({ via: "membership", canViewMedical: true });
  });

  it("refuses someone with no membership and no platform role", async () => {
    state.session = stranger;
    const result = await requireOrgRoleApi(7, "org_viewer");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("refuses PortPass staff until they have passed the second step", async () => {
    state.session = platformAdmin;
    const result = await requireOrgRoleApi(7, "org_owner");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toMatchObject({ code: "mfa_required", verify: "/admin/verify" });
    }
  });

  it("needs both a code this session and an open 12-hour window", async () => {
    state.session = platformAdmin;
    state.step = { aal2: true, windowOpen: false, enrolled: true, factorId: "f1" };
    expect((await requireOrgRoleApi(7, "org_owner")).ok).toBe(false);
    state.step = { aal2: false, windowOpen: true, enrolled: true, factorId: "f1" };
    expect((await requireOrgRoleApi(7, "org_owner")).ok).toBe(false);
    state.step = { aal2: true, windowOpen: true, enrolled: true, factorId: "f1" };
    const result = await requireOrgRoleApi(7, "org_owner");
    expect(result.ok).toBe(true);
    // The platform door never opens medical details.
    if (result.ok) expect(result).toMatchObject({ via: "platform", canViewMedical: false });
  });

  it("treats a founder who is also the business's owner as its owner", async () => {
    state.session = founderWhoOwns;
    const result = await requireOrgRoleApi(7, "org_owner");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.via).toBe("membership");
  });

  it("says 401 when nobody is signed in", async () => {
    const result = await requireOrgRoleApi(7, "org_viewer");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});

describe("requireOrgRole (pages)", () => {
  it("sends PortPass staff to the verify screen and back", async () => {
    state.session = platformAdmin;
    await expect(requireOrgRole({ slug: "futprep" }, "org_admin", "/business/futprep/settings")).rejects.toThrow("REDIRECT:/admin/verify?next=%2Fbusiness%2Ffutprep%2Fsettings");
    state.step = { aal2: true, windowOpen: true, enrolled: true, factorId: "f1" };
    await expect(requireOrgRole({ slug: "futprep" }, "org_admin", "/business/futprep/settings")).resolves.toMatchObject({ via: "platform" });
  });

  it("404s for a signed-in person with no way in, and sends a signed-out one to sign in", async () => {
    state.session = stranger;
    await expect(requireOrgRole(7, "org_viewer", "/business/futprep")).rejects.toThrow("NOT_FOUND");
    state.session = null;
    await expect(requireOrgRole(7, "org_viewer", "/business/futprep")).rejects.toThrow("REDIRECT:/login?next=%2Fbusiness%2Ffutprep");
  });
});
