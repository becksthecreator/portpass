import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

// Storage replaced by a fake bucket holding a tiny made-up look book: the
// real one is private and never in this (public) repo.
const bucket = vi.hoisted(() => ({
  files: new Map<string, string>([
    ["lookbooks/futprep-draft1/index.html", '<!doctype html><html><head><meta name="robots" content="noindex"><link rel="stylesheet" href="assets/book.css"></head><body><h1>TEST look book</h1></body></html>'],
    ["lookbooks/futprep-draft1/assets/book.css", "body{color:red}"],
    ["lookbooks/futprep-draft1/assets/book.js", "void 0;"],
    ["lookbooks/futprep-draft1/assets/img/kit/today-1.jpg", "jpeg-bytes"],
  ]),
  asked: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/db/supabase", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: (name: string) => ({
        download: async (key: string) => {
          bucket.asked.push(`${name}/${key}`);
          const text = bucket.files.get(`${name}/${key}`);
          return text === undefined ? { data: null, error: { message: "Object not found" } } : { data: new Blob([text]), error: null };
        },
      }),
    },
  }),
}));
import { GET, HEAD } from "./route";
import { GET as ASSET } from "./assets/[...path]/route";
import { LOOKBOOK_COOKIE, lookbookCookieMatches, lookbookCookieValue, lookbookKeyMatches, MIN_KEY_LENGTH, readCookie, withBase, withDraftRibbon } from "@/lib/lookbook/access";
import { lookbookAssetKey, readLookbookAsset } from "@/lib/lookbook/futprepDraft";

// A made-up test key, never a real one.
const KEY = "test-key-for-the-lookbook-0123456789";
const get = (query = "") => GET(new Request(`http://localhost/lookbook/futprep${query}`));
const asset = (parts: string[], headers: Record<string, string> = {}, query = "") =>
  ASSET(new Request(`http://localhost/lookbook/futprep/assets/${parts.join("/")}${query}`, { headers }), { params: Promise.resolve({ path: parts }) });

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
    expect(lookbookCookieValue(short)).toBeNull();
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
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    delete process.env.FUTPREP_LOOKBOOK_KEY;
    expect((await get(`?k=${KEY}`)).status).toBe(404);
  });

  it("opens Site Design's page with the key, marked Draft 1, out of search and caches", async () => {
    const response = await get(`?k=${encodeURIComponent(KEY)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await response.text();
    expect(html).toContain("Draft 1 · Private");
    expect(html).toContain('<base href="/lookbook/futprep/">');
    expect(html).toContain("assets/book.css");
    expect(html).toContain("TEST look book");
    expect(html).not.toContain(KEY);
  });

  it("sets a path-scoped, HttpOnly cookie that holds a hash, never the key", async () => {
    const cookie = (await get(`?k=${KEY}`)).headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${LOOKBOOK_COOKIE}=${lookbookCookieValue(KEY)}`);
    expect(cookie).toContain("Path=/lookbook/futprep");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain(KEY);
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

describe("GET /lookbook/futprep/assets/...", () => {
  const before = process.env.FUTPREP_LOOKBOOK_KEY;
  beforeEach(() => { process.env.FUTPREP_LOOKBOOK_KEY = KEY; });
  afterEach(() => { if (before === undefined) delete process.env.FUTPREP_LOOKBOOK_KEY; else process.env.FUTPREP_LOOKBOOK_KEY = before; });
  const withCookie = () => ({ cookie: `other=1; ${LOOKBOOK_COOKIE}=${lookbookCookieValue(KEY)}` });

  it("is a 404 without the look book's cookie or key, or with a wrong cookie", async () => {
    expect((await asset(["book.css"])).status).toBe(404);
    expect((await asset(["book.css"], { cookie: `${LOOKBOOK_COOKIE}=${"0".repeat(64)}` })).status).toBe(404);
  });

  it("serves the page's files with the cookie, typed and private", async () => {
    const css = await asset(["book.css"], withCookie());
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(css.headers.get("x-robots-tag")).toContain("noindex");
    const photo = await asset(["img", "kit", "today-1.jpg"], withCookie());
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect((await asset(["book.js"], {}, `?k=${KEY}`)).status).toBe(200);
  });

  it("a cookie stops working when the key changes", async () => {
    const old = withCookie();
    process.env.FUTPREP_LOOKBOOK_KEY = `${KEY}-rotated`;
    expect((await asset(["book.css"], old)).status).toBe(404);
  });

  it("never names a file outside the look book's assets/ or of an unknown type", async () => {
    bucket.asked.length = 0;
    for (const parts of [["..", "index.html"], ["..", "..", "..", "package.json"], ["img", "..", "..", "index.html"], [".env"], ["book.css.map"], []]) {
      expect((await asset(parts, withCookie())).status).toBe(404);
      expect(await readLookbookAsset(parts)).toBeNull();
      expect(lookbookAssetKey(parts)).toBeNull();
    }
    expect(bucket.asked).toEqual([]);
    expect(lookbookAssetKey(["img", "kit", "today-1.jpg"])?.key).toBe("futprep-draft1/assets/img/kit/today-1.jpg");
  });

  it("a file missing from storage is a 404", async () => {
    expect((await asset(["nope.css"], withCookie())).status).toBe(404);
  });
});

describe("helpers", () => {
  it("withDraftRibbon puts the ribbon first inside <body>, or first of all without one", () => {
    expect(withDraftRibbon("<html><body class=x><h1>Hi</h1></body></html>")).toMatch(/<body class=x><div role="note"[^>]*>Draft 1/);
    expect(withDraftRibbon("<h1>Hi</h1>")).toMatch(/^<div role="note"/);
  });

  it("withBase goes first inside <head>", () => {
    expect(withBase("<html><head><title>x</title></head></html>", "/a/")).toBe('<html><head><base href="/a/"><title>x</title></head></html>');
  });

  it("readCookie and lookbookCookieMatches", () => {
    expect(readCookie("a=1; b=two=2", "b")).toBe("two=2");
    expect(readCookie(null, "a")).toBeNull();
    expect(lookbookCookieMatches(lookbookCookieValue(KEY), KEY)).toBe(true);
    expect(lookbookCookieMatches("short", KEY)).toBe(false);
  });
});

describe("the look book stays off the public site", () => {
  it("is not in the sitemap or robots.txt, and nothing links to it", () => {
    for (const file of ["app/sitemap.ts", "app/robots.ts", "app/_components/SiteNav.tsx", "app/_components/SiteFooter.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("lookbook");
    }
  });

  it("the book itself is never in this public repo", () => {
    expect(() => readFileSync("public/futprep-lookbook/index.html")).toThrow();
    expect(() => readFileSync("private/lookbook/futprep-draft1/index.html")).toThrow();
    expect(readFileSync(".gitignore", "utf8")).toContain("/private/");
  });
});
