// What is kept from a browser's Content-Security-Policy report
// (app/api/security/csp-report): the directive, the blocked origin (never
// the full address, which can carry a token) and the page's path (never
// its query). Pure, so it can be tested without a request.

export type CspReport = { directive: string; blocked: string; page: string };

function originOf(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    return new URL(value).origin;
  } catch {
    // "inline", "eval", "data" and the like come through as plain words.
    return value.replace(/[^a-z:-]/gi, "").slice(0, 20);
  }
}

function pathOf(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    return new URL(value).pathname.slice(0, 200);
  } catch {
    return "";
  }
}

// Two shapes arrive: the report-uri one ({"csp-report": {...}}) and the
// Reporting API's ([{type: "csp-violation", body: {...}}]).
export function cspReportsFrom(body: unknown): CspReport[] {
  if (Array.isArray(body)) {
    return body
      .filter((item): item is { type?: unknown; body?: Record<string, unknown> } => Boolean(item) && typeof item === "object")
      .filter((item) => item.type === "csp-violation" && item.body && typeof item.body === "object")
      .map((item) => ({ directive: String(item.body!.effectiveDirective ?? item.body!.violatedDirective ?? "").slice(0, 60), blocked: originOf(item.body!.blockedURL), page: pathOf(item.body!.documentURL) }));
  }
  const legacy = body && typeof body === "object" ? (body as { "csp-report"?: Record<string, unknown> })["csp-report"] : null;
  if (!legacy || typeof legacy !== "object") return [];
  return [{ directive: String(legacy["effective-directive"] ?? legacy["violated-directive"] ?? "").slice(0, 60), blocked: originOf(legacy["blocked-uri"]), page: pathOf(legacy["document-uri"]) }];
}
