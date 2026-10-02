// The Member Pass on the phone (brief 10, 6.2). What the pass page keeps
// so it still opens with no signal: a first name, the member number,
// "member since" and the next ten minutes of codes. No email, no phone, no
// secret. Cleared when the member signs out.

export type PassCode = { code: string; from: number; until: number };

export type StoredPass = {
  firstName: string;
  memberNumber: string;
  memberSince: string;
  codes: PassCode[];
  // Server time minus this phone's time, when the codes were fetched.
  offset: number;
};

export const PASS_STORAGE_KEY = "pp_member_pass_v1";

// The code to show at a moment (in the server's time), or null when the
// codes in hand don't cover it.
export function currentCode(codes: PassCode[], serverNow: number): PassCode | null {
  return codes.find((code) => code.from <= serverNow && serverNow < code.until) ?? null;
}

function isCode(value: unknown): value is PassCode {
  const code = value as PassCode | null;
  return Boolean(code) && typeof code!.code === "string" && /^\d{6}$/.test(code!.code) && Number.isFinite(code!.from) && Number.isFinite(code!.until);
}

// What was stored, checked: anything malformed, or with every code already
// expired, is treated as nothing.
export function parseStoredPass(raw: string | null, now: number): StoredPass | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredPass> | null;
    if (!value || typeof value.firstName !== "string" || typeof value.memberNumber !== "string" || typeof value.memberSince !== "string") return null;
    if (!Array.isArray(value.codes) || !value.codes.every(isCode)) return null;
    const offset = Number.isFinite(value.offset) ? Number(value.offset) : 0;
    if (!value.codes.some((code) => code.until > now + offset)) return null;
    return { firstName: value.firstName, memberNumber: value.memberNumber, memberSince: value.memberSince, codes: value.codes, offset };
  } catch {
    return null;
  }
}

export function readStoredPass(): StoredPass | null {
  try {
    const stored = parseStoredPass(window.localStorage.getItem(PASS_STORAGE_KEY), Date.now());
    if (!stored) window.localStorage.removeItem(PASS_STORAGE_KEY);
    return stored;
  } catch {
    return null;
  }
}

export function storePass(pass: StoredPass): void {
  try {
    window.localStorage.setItem(PASS_STORAGE_KEY, JSON.stringify(pass));
  } catch {
    // Private browsing, or storage is full: the pass still works online.
  }
}

export function clearStoredPass(): void {
  try {
    window.localStorage.removeItem(PASS_STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
}
