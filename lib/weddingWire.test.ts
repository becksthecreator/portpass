import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isWeddingWireMemberId, weddingWireSnippet, type WeddingWireWidget } from "./weddingWire";

const WIDGETS: WeddingWireWidget[] = ["rating", "award", "reviews"];

// What the page rendered before the snippets were built in code: the three
// embed codes as 202609241015 stored them (the live row held the same bytes
// on 6 Oct 2026). One SQL string literal per column, '' for each quote.
function storedSnippets(): Record<WeddingWireWidget, string> {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/202609241015_wedding_site_weddingwire_widgets.sql"), "utf8");
  const column = (name: string) => {
    const match = sql.match(new RegExp(`${name} = '((?:[^']|'')*)'`));
    if (!match) throw new Error(`${name} is not in 202609241015`);
    return match[1].replace(/''/g, "'");
  };
  return { rating: column("rating_badge_html"), award: column("award_badge_html"), reviews: column("reviews_widget_html") };
}

const scripts = (html: string) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attributes: m[1], body: m[2] }));

describe("the WeddingWire snippets", () => {
  it("are, for Antonio's member ID, exactly the embed code the page rendered before", () => {
    const stored = storedSnippets();
    for (const widget of WIDGETS) expect(weddingWireSnippet(widget, "946150"), widget).toBe(stored[widget]);
  });

  it("change with the member ID and nothing else", () => {
    for (const widget of WIDGETS) {
      const antonio = weddingWireSnippet(widget, "946150")!;
      expect(antonio.split("946150").length - 1, widget).toBe(1);
      expect(weddingWireSnippet(widget, "123"), widget).toBe(antonio.replace("946150", "123"));
    }
  });

  it("load scripts only from cdn1.weddingwire.com, and run only WeddingWire's own call", () => {
    const calls: Record<WeddingWireWidget, RegExp> = {
      rating: /^wpShowRatedWW\('[1-9][0-9]{0,11}'\);$/,
      award: /^wpShowRatedWAv3\('[1-9][0-9]{0,11}','2026'\);$/,
      reviews: /^wpShowReviews\([1-9][0-9]{0,11}, "red"\);$/,
    };
    for (const widget of WIDGETS) {
      const found = scripts(weddingWireSnippet(widget, "946150")!);
      const loaders = found.filter((s) => /\bsrc=/.test(s.attributes));
      const inline = found.filter((s) => !/\bsrc=/.test(s.attributes));
      expect(loaders, widget).toHaveLength(1);
      expect(loaders[0].attributes, widget).toMatch(/ src="https:\/\/cdn1\.weddingwire\.com\/[^"<>\s]+"$/);
      expect(loaders[0].body, widget).toBe("");
      expect(inline.map((s) => s.body), widget).toHaveLength(1);
      expect(inline[0].body, widget).toMatch(calls[widget]);
      // Nothing else that runs: no handler attribute, no javascript: link.
      expect(weddingWireSnippet(widget, "946150"), widget).not.toMatch(/\son\w+\s*=|javascript:/i);
    }
  });

  it("are not built from anything but a member ID", () => {
    const refused = [
      "", "0", "0946150", "1234567890123", " 946150", "946150 ", "946150\n", "９４６１５０", "946,150", "9.5", "-946150", "1e6", "0x1F",
      "946150'", "946150');alert(1);//", "946150, \"red\"); fetch('/admin'); (", "<script>alert(1)</script>", "946150</script><script>alert(1)",
    ];
    for (const value of refused) {
      expect(isWeddingWireMemberId(value), JSON.stringify(value)).toBe(false);
      for (const widget of WIDGETS) expect(weddingWireSnippet(widget, value), `${widget} ${JSON.stringify(value)}`).toBeNull();
    }
    for (const value of [946150, null, undefined, ["946150"], { toString: () => "946150" }]) expect(isWeddingWireMemberId(value)).toBe(false);
    expect(isWeddingWireMemberId("946150")).toBe(true);
    expect(isWeddingWireMemberId("1")).toBe(true);
    expect(isWeddingWireMemberId("999999999999")).toBe(true);
  });
});
