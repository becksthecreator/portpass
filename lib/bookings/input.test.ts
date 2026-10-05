import { describe, expect, it } from "vitest";
import { parseBookingInput } from "./input";

const TODAY = "2026-10-05";
const good = (over: Record<string, unknown> = {}) => ({
  requestedDate: "2026-10-17",
  requestedTime: "18:00",
  durationOrQty: "3 hours",
  locationText: "Sandyport, Nassau",
  notes: "Birthday party.\nAbout 40 guests.",
  customerName: "Dana Rolle",
  customerPhone: "242-555-0100",
  customerEmail: "Dana@Family.test",
  ...over,
});
const parse = (body: Record<string, unknown>, forChildren = false) => parseBookingInput(body, { today: TODAY, forChildren });

describe("parseBookingInput", () => {
  it("takes a complete request and tidies it", () => {
    const parsed = parse(good());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      requestedDate: "2026-10-17",
      requestedTime: "18:00",
      durationOrQty: "3 hours",
      locationText: "Sandyport, Nassau",
      notes: "Birthday party.\nAbout 40 guests.",
      customerName: "Dana Rolle",
      customerPhone: "+12425550100",
      customerEmail: "dana@family.test",
      guardianConfirmed: false,
      childFirstName: null,
    });
  });

  it("lets the time, how many, where and notes be left out", () => {
    const parsed = parse(good({ requestedTime: "", durationOrQty: undefined, locationText: undefined, notes: undefined }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.requestedTime).toBeNull();
    expect(parsed.value.durationOrQty).toBe("");
    expect(parsed.value.locationText).toBe("");
    expect(parsed.value.notes).toBe("");
  });

  it("allows today, and refuses a date that has passed, one too far off, or one that isn't a date", () => {
    expect(parse(good({ requestedDate: TODAY })).ok).toBe(true);
    expect(parse(good({ requestedDate: "2026-10-04" }))).toMatchObject({ ok: false, field: "requestedDate" });
    expect(parse(good({ requestedDate: "2028-10-05" }))).toMatchObject({ ok: false, field: "requestedDate" });
    expect(parse(good({ requestedDate: "next Saturday" }))).toMatchObject({ ok: false, field: "requestedDate" });
    expect(parse(good({ requestedDate: undefined }))).toMatchObject({ ok: false, field: "requestedDate" });
  });

  it("refuses a time that isn't hours and minutes", () => {
    expect(parse(good({ requestedTime: "6pm" }))).toMatchObject({ ok: false, field: "requestedTime" });
  });

  it("needs a name, a phone that can be reached and an email", () => {
    expect(parse(good({ customerName: " " }))).toMatchObject({ ok: false, field: "customerName" });
    expect(parse(good({ customerPhone: "12" }))).toMatchObject({ ok: false, field: "customerPhone" });
    expect(parse(good({ customerEmail: "dana at family" }))).toMatchObject({ ok: false, field: "customerEmail" });
    expect(parse(good({ customerEmail: "" }))).toMatchObject({ ok: false, field: "customerEmail" });
  });

  it("cuts every field to its limit", () => {
    const parsed = parse(good({ durationOrQty: "x".repeat(200), locationText: "y".repeat(500), notes: "z".repeat(3000), customerName: "n".repeat(300) }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.durationOrQty).toHaveLength(60);
    expect(parsed.value.locationText).toHaveLength(200);
    expect(parsed.value.notes).toHaveLength(1000);
    expect(parsed.value.customerName).toHaveLength(120);
  });

  it("for an under-18s offering, asks for the child's first name and the guardian's tick", () => {
    expect(parse(good(), true)).toMatchObject({ ok: false, field: "childFirstName" });
    expect(parse(good({ childFirstName: "Maya" }), true)).toMatchObject({ ok: false, field: "guardianConfirmed" });
    expect(parse(good({ childFirstName: "Maya", guardianConfirmed: "yes" }), true)).toMatchObject({ ok: false, field: "guardianConfirmed" });
    const parsed = parse(good({ childFirstName: "  Maya Rolle ", guardianConfirmed: true }), true);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // First name only, whatever was typed.
    expect(parsed.value.childFirstName).toBe("Maya");
    expect(parsed.value.guardianConfirmed).toBe(true);
  });

  it("keeps no child's name and no guardian tick for an offering that isn't for children", () => {
    const parsed = parse(good({ childFirstName: "Maya", guardianConfirmed: true }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.childFirstName).toBeNull();
    expect(parsed.value.guardianConfirmed).toBe(false);
  });

  it("keeps clean source tags and drops anything else", () => {
    const parsed = parse(good({ attribution: { utmSource: "portpass", utmMedium: "qr", utmCampaign: "<script>", referrerHost: "Instagram.com", viaPortpass: true } }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.attribution).toEqual({ utmSource: "portpass", utmMedium: "qr", utmCampaign: null, referrerHost: "instagram.com", viaPortpass: true });
    const none = parse(good({ attribution: "portpass" }));
    expect(none.ok && none.value.attribution).toEqual({ utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, viaPortpass: false });
  });
});
