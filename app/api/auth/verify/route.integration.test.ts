import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Proves the code -> session -> bootstrap path against the local Supabase
// stack: a verified code creates the profile, grants platform_owner to a
// configured founder email, accepts an open invite into a membership, and
// links the existing people row. The code comes from the admin API
// (generateLink), which works with the local enable_signup=false.
//
// The route reads and writes cookies through next/headers, which only
// exists inside a Next request; a tiny in-memory jar stands in for it.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

import { POST } from "./route";

const url = process.env.SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const email = `otp-${crypto.randomUUID().slice(0, 8)}@test.portpass.local`;
let userId: string | null = null;
let orgId: number | null = null;
let personId: number | null = null;
let inviteId: number | null = null;

function post(payload: Record<string, unknown>) {
  return POST(
    new Request("https://portpass.test/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

describe.skipIf(!publishable)("POST /api/auth/verify", () => {
  beforeAll(async () => {
    process.env.PLATFORM_OWNER_EMAILS = `someone-else@test.portpass.local, ${email.toUpperCase()}`;

    const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: "Test Founder" } });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;

    const { data: org } = await admin.from("organizations").select("id").eq("slug", "futprep").single();
    orgId = Number(org!.id);

    const invite = await admin
      .from("organization_invites")
      .insert({ organization_id: orgId, email, role: "org_staff", can_view_medical: true, token_hash: crypto.randomUUID(), expires_at: new Date(Date.now() + 3600_000).toISOString() })
      .select("id")
      .single();
    expect(invite.error).toBeNull();
    inviteId = Number(invite.data!.id);

    const person = await admin.from("people").insert({ name: "TEST — delete parent", email }).select("id").single();
    expect(person.error).toBeNull();
    personId = Number(person.data!.id);
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (personId) await admin.from("people").delete().eq("id", personId);
    if (inviteId) await admin.from("organization_invites").delete().eq("id", inviteId);
    await admin.from("audit_log").delete().eq("actor_user_id", userId ?? "");
  });

  it("rejects a wrong code without saying whether the email exists", async () => {
    const res = await post({ email, token: "000000" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/didn.t work/i);
    expect(body.error).not.toMatch(new RegExp(email, "i"));
  });

  it("verifies a real code, bootstraps the account, and routes to the chooser", async () => {
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    expect(link.error).toBeNull();
    const otp = link.data.properties?.email_otp;
    expect(otp).toMatch(/^\d{6,10}$/);

    const res = await post({ email, token: otp });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; next?: string };
    expect(body.ok).toBe(true);
    // Founder + one business membership = more than one place to be.
    expect(body.next).toBe("/where-to");

    const { data: profile } = await admin.from("profiles").select("full_name,platform_role").eq("user_id", userId!).single();
    expect(profile).toMatchObject({ full_name: "Test Founder", platform_role: "platform_owner" });

    const { data: membership } = await admin.from("organization_members").select("role,can_view_medical").eq("user_id", userId!).eq("organization_id", orgId!).single();
    expect(membership).toMatchObject({ role: "org_staff", can_view_medical: true });

    const { data: invite } = await admin.from("organization_invites").select("accepted_at").eq("id", inviteId!).single();
    expect(invite!.accepted_at).not.toBeNull();

    const { data: person } = await admin.from("people").select("auth_user_id").eq("id", personId!).single();
    expect(person!.auth_user_id).toBe(userId);

    const { count } = await admin.from("people").select("id", { count: "exact", head: true }).eq("email", email);
    expect(count).toBe(1);
  });
});
