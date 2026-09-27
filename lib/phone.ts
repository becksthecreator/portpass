// Bahamas-first E.164 normaliser for phone and WhatsApp fields. Accepts
// the ways people actually type a 242 number -- 7 digits, 10 digits,
// with or without +1 -- and returns "+1242XXXXXXX" (or the equivalent for
// another country when they included a + or 00 prefix). Returns null when
// the input can't be made into a plausible international number, so the
// caller can ask again instead of storing something WhatsApp can't dial.
export function normalizePhoneE164(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const international = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (international) {
    if (raw.startsWith("00")) digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 7) return `+1242${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// "+12424238161" -> "+1 (242) 423-8161"; anything outside the North
// American plan is returned as-is.
export function formatPhoneDisplay(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+1 (${match[1]}) ${match[2]}-${match[3]}` : e164;
}
