import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";

// The notification goes to a real inbox in production; here it's asserted,
// not sent. Mocked before the route import so the route binds the stub.
vi.mock("@/lib/email", () => ({ sendApplicationReceivedEmail: vi.fn(async () => {}) }));

import { POST } from "./route";
import { sendApplicationReceivedEmail } from "@/lib/email";

// Requires SUPABASE_URL/SUPABASE_SECRET_KEY pointed at the local Supabase
// stack started in .github/workflows/ci.yml (migrations applied by
// `supabase start`).
const createdNames: string[] = [];

function post(payload: Record<string, unknown>) {
  return POST(
    new Request("https://portpass.test/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }) as never,
  );
}

function basePayload(overrides: Record<string, unknown> = {}) {
  const businessName = `TEST — delete ${crypto.randomUUID().slice(0, 8)}`;
  createdNames.push(businessName);
  return {
    name: "Test Owner",
    businessName,
    section: "entertainment",
    whatsapp: "242-555-0100",
    instagram: "@testbiz.nassau",
    note: "TEST — delete",
    utm_source: "own",
    utm_medium: "qr",
    utm_campaign: "own2026",
    ...overrides,
  };
}

afterAll(async () => {
  if (!createdNames.length) return;
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
  await db.from("applications").delete().in("organization_name", createdNames);
});

describe("POST /api/applications", () => {
  it("stores a WhatsApp-first application with its section and UTM tags, and notifies support", async () => {
    const payload = basePayload();
    const response = await post(payload);
    expect(response.status).toBe(201);

    const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
    const { data, error } = await db
      .from("applications")
      .select("contact_person,section,whatsapp_e164,phone,instagram_handle,description,utm_source,utm_medium,utm_campaign,email,status")
      .eq("organization_name", payload.businessName)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      contact_person: "Test Owner",
      section: "entertainment",
      whatsapp_e164: "+12425550100",
      phone: "+12425550100",
      instagram_handle: "testbiz.nassau",
      description: "TEST — delete",
      utm_source: "own",
      utm_medium: "qr",
      utm_campaign: "own2026",
      email: null,
      status: "submitted",
    });
    expect(sendApplicationReceivedEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendApplicationReceivedEmail).mock.calls[0][0]).toMatchObject({
      organizationName: payload.businessName,
      whatsappE164: "+12425550100",
      utmCampaign: "own2026",
    });
  });

  it("rejects a section that isn't one of the five", async () => {
    const response = await post(basePayload({ section: "crypto" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/section/i);
  });

  it("rejects a WhatsApp number it can't dial", async () => {
    const response = await post(basePayload({ whatsapp: "call me" }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/whatsapp number/i);
  });
});
