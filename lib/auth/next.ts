// A ?next= value is attacker-controllable (it arrives in a link), so only a
// same-site path is ever followed: leading slash, not protocol-relative,
// no backslashes (browsers normalise "\" to "/"), no control characters.
export function isSafeNext(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 512) return false;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/[^/?#]*:/.test(value)) return false;
  return true;
}

export function safeNext(value: unknown, fallback: string): string {
  return isSafeNext(value) ? value : fallback;
}
