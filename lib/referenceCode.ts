// Reference codes (FP-2026-AB12CD34) are what a parent types to find a
// registration, and what the "finish registration" link carries. They are
// matched exactly, after being checked against the format: a typed value is
// never used as a database pattern, so "%" or "_" cannot stand in for a
// code someone doesn't know.

const REFERENCE_CODE = /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4,8}$/;

// The canonical (upper-case) code, or null if the text isn't a code at all.
export function normalizeReferenceCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return REFERENCE_CODE.test(code) ? code : null;
}

// For the few places a name is compared case-insensitively with ILIKE (is
// this child already registered?): every pattern character in what was
// typed is made literal. PostgREST also reads "*" as a wildcard; escaped,
// it can only match a literal "%", which no name contains.
export function escapeLikePattern(value: string): string {
  const BACKSLASH = String.fromCharCode(92);
  let escaped = "";
  for (const char of value) {
    escaped += char === BACKSLASH || char === "%" || char === "_" || char === "*" ? BACKSLASH + char : char;
  }
  return escaped;
}
