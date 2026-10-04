import { describe, expect, it } from "vitest";
import { addPending, cleanEventCode, cleanInstagram, eventName, OFFLINE_MAX, parseEventSignup, readPending } from "./eventSignup";

const isSection = (slug: string) => ["sports-fitness", "entertainment"].includes(slug);
const good = { event: "own2026", name: "Test Owner", businessName: "TEST delete Harbour Tours", whatsapp: "555-0142", section: "entertainment", instagram: "@Harbour.Tours", whatsappConsent: true };

describe("an event code", () => {
  it("is lower-case words and digits joined by dashes", () => {
    expect(cleanEventCode("own2026")).toBe("own2026");
    expect(cleanEventCode(" School-Fair-Nov ")).toBe("school-fair-nov");
    for (const bad of ["", "a", "own 2026", "own_2026", "-own", "own-", "own--2026", "../admin", "own2026?x=1", "x".repeat(41), null, 7]) expect(cleanEventCode(bad)).toBeNull();
  });

  it("has a name: its own, or the code in words", () => {
    expect(eventName("own2026")).toBe("OWN Conference 2026");
    expect(eventName("school-fair-nov")).toBe("School Fair Nov");
  });
});

describe("a sign-up", () => {
  it("needs a name, a business, a WhatsApp number and a section", () => {
    const parsed = parseEventSignup(good, isSection);
    expect(parsed).toEqual({ ok: true, value: { event: "own2026", name: "Test Owner", businessName: "TEST delete Harbour Tours", whatsappE164: "+12425550142", section: "entertainment", instagramHandle: "harbour.tours", whatsappConsent: true } });
    for (const missing of ["name", "businessName", "whatsapp", "section"] as const) expect(parseEventSignup({ ...good, [missing]: "" }, isSection).ok).toBe(false);
    expect(parseEventSignup({ ...good, whatsapp: "12345" }, isSection).ok).toBe(false);
    expect(parseEventSignup({ ...good, section: "not-a-section" }, isSection).ok).toBe(false);
    expect(parseEventSignup({ ...good, event: "Not A Code!" }, isSection).ok).toBe(false);
  });

  it("counts the WhatsApp box only when it was really ticked", () => {
    for (const value of [undefined, false, "true", "on", 1]) {
      const parsed = parseEventSignup({ ...good, whatsappConsent: value }, isSection);
      expect(parsed.ok && parsed.value.whatsappConsent).toBe(false);
    }
  });

  it("takes Instagram as a handle or a link, and drops anything else", () => {
    expect(cleanInstagram("@harbourkids")).toBe("harbourkids");
    expect(cleanInstagram("https://www.instagram.com/Harbour_Kids/?hl=en")).toBe("harbour_kids");
    expect(cleanInstagram("we are on facebook")).toBeNull();
    expect(cleanInstagram("")).toBeNull();
    const parsed = parseEventSignup({ ...good, instagram: "" }, isSection);
    expect(parsed.ok && parsed.value.instagramHandle).toBeNull();
  });
});

describe("waiting for a signal", () => {
  const now = 1_800_000_000_000;

  it("keeps what was saved, and nothing that is not a saved sign-up", () => {
    const list = addPending([], good, "a", now);
    expect(readPending(JSON.stringify(list), now)).toEqual([{ id: "a", savedAt: now, body: good }]);
    expect(readPending(null, now)).toEqual([]);
    expect(readPending("not json", now)).toEqual([]);
    expect(readPending(JSON.stringify({ id: "a" }), now)).toEqual([]);
    expect(readPending(JSON.stringify([null, 4, { id: 1, savedAt: now, body: {} }, { id: "b", savedAt: now, body: null }]), now)).toEqual([]);
  });

  it("drops a sign-up after a week, and keeps only the newest few", () => {
    const old = addPending([], good, "old", now - 8 * 24 * 60 * 60 * 1000);
    expect(readPending(JSON.stringify(old), now)).toEqual([]);
    let list: ReturnType<typeof addPending> = [];
    for (let i = 0; i < OFFLINE_MAX + 5; i++) list = addPending(list, good, `id-${i}`, now);
    expect(list).toHaveLength(OFFLINE_MAX);
    expect(list[0].id).toBe("id-5");
    expect(list[list.length - 1].id).toBe(`id-${OFFLINE_MAX + 4}`);
  });
});
