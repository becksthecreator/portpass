import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";
import { lookbookKeyMatches, MIN_KEY_LENGTH, withDraftRibbon } from "@/lib/lookbook/access";

// A made-up test key, never a real one.
const KEY = "test-key-for-the-lookbook-0123456789";
const get = (query = "") => GET(new Request(`http://localhost/lookbook/futprep${query}`));

describe("lookbookKeyMatches", () => {
  it("opens only on the exact key", () => {
    expect(lookbookKeyMatches(KEY, KEY)).toBe(true);
    expect(lookbookKeyMatches(KEY.slice(0, -1), KEY)).toBe(false);
    expect(lookbookKeyMatches(`${KEY}x`, KEY)).toBe(false);
    expect(lookbookKeyMatches("", KEY)).toBe(false);
    expect(lookbookKeyMatches(null, KEY)).toBe(false);
  });

  it("fails closed when no key, or a short one, is set", () => {
    expect(lookbookKeyMatches("anything", undefined)).toBe(false);
    expect(lookbookKeyMatches("", "")).toBe(false);
    const short = "x".repeat(MIN_KEY_LENGTH - 1);
    expect(lookbookKeyMatches(short, short)).toBe(false);
  });

  it("refuses an absurdly long key without comparing it", () => {
    expect(lookbookKeyMatches("k".repeat(1000), KEY)).toBe(false);
  });
});

describe("GET /lookbook/futprep", () => {
  const before = process.env.FUTPREP_LOOKBOOK_KEY;
  beforeEach(() => { process.env.FUTPREP_LOOKBOOK_KEY = KEY; });
  afterEach(() => { if (before === undefined) delete process.env.FUTPREP_LOOKBOOK_KEY; else process.env.FUTPREP_LOOKBOOK_KEY = before; });

  it("is a plain 404 without the key, with a wrong key, and when no key is set", async () => {
    for (const response of [await get(), await get("?k=wrong"), await get(`?k=${KEY.slice(0, -1)}`)]) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    }
    delete process.env.FUTPREP_LOOKBOOK_KEY;
    expect((await get(`?k=${KEY}`)).status).toBe(404);
  });

  it("opens with the key, marked Draft 1, out of search and caches", async () => {
    const response = await get(`?k=${encodeURIComponent(KEY)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await response.text();
    expect(html).toContain("Draft 1");
    expect(html).toContain('name="robots" content="noindex');
    expect(html).not.toContain(KEY);
  });

  it("every answer, 404 included, carries the private headers", async () => {
    const response = await get();
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("HEAD answers the same way, with no body", async () => {
    expect((await HEAD(new Request("http://localhost/lookbook/futprep"))).status).toBe(404);
    const ok = await HEAD(new Request(`http://localhost/lookbook/futprep?k=${KEY}`));
    expect(ok.status).toBe(200);
    expect(ok.body).toBeNull();
  });
});

describe("withDraftRibbon", () => {
  it("puts the ribbon first inside <body>, or first of all without one", () => {
    expect(withDraftRibbon("<html><body class=x><h1>Hi</h1></body></html>")).toMatch(/<body class=x><div role="note"[^>]*>Draft 1/);
    expect(withDraftRibbon("<h1>Hi</h1>")).toMatch(/^<div role="note"/);
  });
});

describe("the look book stays off the public site", () => {
  it("is not in the sitemap or robots.txt, and nothing links to it", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["app/sitemap.ts", "app/robots.ts", "app/_components/SiteNav.tsx", "app/_components/SiteFooter.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("lookbook");
    }
  });
});
