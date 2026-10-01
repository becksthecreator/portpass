import { describe, expect, it } from "vitest";
import { announcementVisible, cleanAnnouncement, cleanHref, cleanSpotlight, EMPTY_ANNOUNCEMENT, nassauDay, orderBySpotlight, readAnnouncement } from "./siteContent";
import { cleanSponsor } from "./sponsors";
import { leadsFunnel, type FunnelLead } from "./scout/leads";

describe("the announcement bar", () => {
  it("tidies what was typed and keeps a link on this site or a full https address", () => {
    const cleaned = cleanAnnouncement({ text: "  See us at   OWN, 8 to 11 Oct ", href: "/apply", linkLabel: " Get listed ", active: true, until: "2026-10-11" });
    expect(cleaned).toEqual({ ok: true, value: { text: "See us at OWN, 8 to 11 Oct", href: "/apply", linkLabel: "Get listed", active: true, until: "2026-10-11" } });
    expect(cleanHref("https://example.com/own")).toBe("https://example.com/own");
    expect(cleanHref("")).toBeNull();
  });

  it("refuses a link that could run code or leave the site unseen", () => {
    for (const href of ["javascript:alert(1)", "//evil.example", "http://example.com", "data:text/html,x", "/apply\"onmouseover=", "apply"]) expect(cleanHref(href)).toBeUndefined();
    expect(cleanAnnouncement({ text: "TEST", href: "javascript:alert(1)", active: true })).toMatchObject({ ok: false });
  });

  it("can't be switched on empty, be too long, or end on a date that doesn't exist", () => {
    expect(cleanAnnouncement({ text: " ", active: true })).toMatchObject({ ok: false });
    expect(cleanAnnouncement({ text: "x".repeat(141), active: false })).toMatchObject({ ok: false });
    expect(cleanAnnouncement({ text: "TEST", active: true, until: "2026-02-30" })).toMatchObject({ ok: false });
    expect(cleanAnnouncement({ text: "", active: false })).toMatchObject({ ok: true });
  });

  it("gives a link with no words a plain label, and drops the label when there is no link", () => {
    expect(cleanAnnouncement({ text: "TEST", href: "/pricing", active: true })).toMatchObject({ ok: true, value: { linkLabel: "See more" } });
    expect(cleanAnnouncement({ text: "TEST", linkLabel: "Go", active: true })).toMatchObject({ ok: true, value: { href: null, linkLabel: null } });
  });

  it("shows only while on, with words, up to and including its last day", () => {
    const bar = { text: "TEST", href: null, linkLabel: null, active: true, until: "2026-10-11" };
    expect(announcementVisible(bar, "2026-10-11")).toBe(true);
    expect(announcementVisible(bar, "2026-10-12")).toBe(false);
    expect(announcementVisible({ ...bar, until: null }, "2030-01-01")).toBe(true);
    expect(announcementVisible({ ...bar, active: false }, "2026-10-01")).toBe(false);
    expect(announcementVisible(EMPTY_ANNOUNCEMENT, "2026-10-01")).toBe(false);
  });

  it("reads a stored value it doesn't understand as off", () => {
    expect(readAnnouncement(null)).toEqual(EMPTY_ANNOUNCEMENT);
    expect(readAnnouncement({ text: "TEST", href: "javascript:x", active: true })).toEqual(EMPTY_ANNOUNCEMENT);
  });

  it("uses Nassau's calendar for today", () => {
    // 02:30 UTC on the 12th is still the 11th in Nassau.
    expect(nassauDay(new Date("2026-10-12T02:30:00Z"))).toBe("2026-10-11");
  });
});

describe("the homepage card order", () => {
  it("keeps slugs only, once each", () => {
    expect(cleanSpotlight(["futprep", "bahamas-weddings", "futprep", "Not A Slug", 7, "../x"])).toEqual(["futprep", "bahamas-weddings"]);
    expect(cleanSpotlight("futprep")).toEqual([]);
  });

  it("puts the chosen businesses first in the chosen order, and the rest after in their own order", () => {
    const items = [{ slug: "a" }, { slug: "b" }, { slug: "c" }, { slug: "d" }];
    expect(orderBySpotlight(items, ["c", "gone", "a"]).map((i) => i.slug)).toEqual(["c", "a", "b", "d"]);
    expect(orderBySpotlight(items, [])).toBe(items);
  });
});

describe("a sponsor", () => {
  it("needs a name and a status, and keeps a value in whole cents", () => {
    expect(cleanSponsor({ name: "  TEST   Print Shop ", item: "Banner", valueCents: 25000, whatWeGive: "Two free months", status: "agreed", notes: "" })).toEqual({ ok: true, value: { name: "TEST Print Shop", item: "Banner", valueCents: 25000, whatWeGive: "Two free months", status: "agreed", notes: "" } });
    expect(cleanSponsor({ name: " ", status: "agreed" })).toMatchObject({ ok: false });
    expect(cleanSponsor({ name: "TEST", status: "won" })).toMatchObject({ ok: false });
    for (const valueCents of [-1, 12.5, "250", 100_000_001]) expect(cleanSponsor({ name: "TEST", status: "talking", valueCents })).toMatchObject({ ok: false });
    expect(cleanSponsor({ name: "TEST", status: "talking" })).toMatchObject({ ok: true, value: { valueCents: null, item: "" } });
  });
});

describe("the leads funnel", () => {
  const lead = (id: number, over: Partial<FunnelLead>): FunnelLead => ({ id, status: "new", lastContactOn: null, createdAt: "2026-09-01T12:00:00+00:00", ...over });
  const weekAgo = "2026-09-24T12:00:00.000Z";

  it("counts where each lead stands, and what the audit log says it reached", () => {
    const funnel = leadsFunnel(
      [
        lead(1, { createdAt: "2026-09-28T12:00:00+00:00" }),
        lead(2, { status: "contacted", lastContactOn: "2026-09-29" }),
        lead(3, { status: "replied", lastContactOn: "2026-09-10" }),
        lead(4, { status: "live" }),
        // Drafted before any message: neither contacted nor replied.
        lead(5, { status: "page_drafted" }),
        // Replied once, then went quiet: still a reply.
        lead(6, { status: "not_now", lastContactOn: "2026-09-12" }),
      ],
      [
        { leadId: 6, status: "replied", at: "2026-09-13T12:00:00+00:00" },
        { leadId: 2, status: "contacted", at: "2026-09-29T12:00:00+00:00" },
        { leadId: 4, status: "live", at: "2026-09-30T12:00:00+00:00" },
        // A lead since removed is not counted.
        { leadId: 99, status: "replied", at: "2026-09-30T12:00:00+00:00" },
      ],
      weekAgo,
    );
    expect(funnel.allTime).toEqual({ added: 6, contacted: 4, replied: 3, live: 1 });
    expect(funnel.week).toEqual({ added: 1, contacted: 1, replied: 0, live: 1 });
    expect(funnel.replyRate).toBe(0.75);
    expect(funnel.closeRate).toBe(0.25);
  });

  it("has no rates before anyone was contacted", () => {
    expect(leadsFunnel([lead(1, {})], [], weekAgo)).toMatchObject({ replyRate: null, closeRate: null });
  });
});
