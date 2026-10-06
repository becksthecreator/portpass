import { afterEach, describe, expect, it, vi } from "vitest";
import { cspReportsFrom as reportsFrom } from "@/lib/cspReport";
import { POST } from "./route";

describe("the CSP report route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads both report shapes and keeps only the directive, the blocked origin and the page's path", () => {
    const legacy = { "csp-report": { "document-uri": "https://portpassbahamas.com/pay/abc123def?x=secret-value", "violated-directive": "script-src-elem", "effective-directive": "script-src", "blocked-uri": "https://evil.example/track.js?token=abc" } };
    expect(reportsFrom(legacy)).toEqual([{ directive: "script-src", blocked: "https://evil.example", page: "/pay/abc123def" }]);
    const modern = [{ type: "csp-violation", body: { documentURL: "https://portpassbahamas.com/account?code=1234", effectiveDirective: "img-src", blockedURL: "inline" } }, { type: "deprecation", body: {} }];
    expect(reportsFrom(modern)).toEqual([{ directive: "img-src", blocked: "inline", page: "/account" }]);
    expect(reportsFrom("nonsense")).toEqual([]);
    expect(reportsFrom({})).toEqual([]);
  });

  it("answers 204 to anything and logs a line per report, with no query string or token in it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = JSON.stringify({ "csp-report": { "document-uri": "https://portpassbahamas.com/booking/tok3n?secret=hunter2", "effective-directive": "frame-src", "blocked-uri": "https://frames.example/embed?sid=hunter2" } });
    const response = await POST(new Request("https://portpassbahamas.com/api/security/csp-report", { method: "POST", body, headers: { "content-type": "application/csp-report" } }));
    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(warn.mock.calls[0]);
    expect(line).toContain("frame-src");
    expect(line).toContain("https://frames.example");
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("sid=");
    expect((await POST(new Request("https://portpassbahamas.com/api/security/csp-report", { method: "POST", body: "not json" }))).status).toBe(204);
    expect((await POST(new Request("https://portpassbahamas.com/api/security/csp-report", { method: "POST", body: "" }))).status).toBe(204);
  });
});
