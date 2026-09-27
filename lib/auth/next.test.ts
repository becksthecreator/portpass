import { describe, expect, it } from "vitest";
import { isSafeNext, safeNext } from "./next";

describe("isSafeNext", () => {
  it("accepts same-site paths, with query strings", () => {
    expect(isSafeNext("/account")).toBe(true);
    expect(isSafeNext("/business/futprep?tab=team")).toBe(true);
    expect(isSafeNext("/weddings/bahamas-weddings-by-the-sea/plan?tier=pink-sand")).toBe(true);
  });

  it("rejects anything that could leave the site", () => {
    expect(isSafeNext("https://evil.example/account")).toBe(false);
    expect(isSafeNext("//evil.example")).toBe(false);
    expect(isSafeNext("/\\evil.example")).toBe(false);
    expect(isSafeNext("javascript:alert(1)")).toBe(false);
    expect(isSafeNext("/foo\nSet-Cookie: x")).toBe(false);
    expect(isSafeNext("")).toBe(false);
    expect(isSafeNext(undefined)).toBe(false);
    expect(isSafeNext("account")).toBe(false);
  });

  it("falls back when unsafe", () => {
    expect(safeNext("//evil.example", "/account")).toBe("/account");
    expect(safeNext("/admin", "/account")).toBe("/admin");
  });
});
