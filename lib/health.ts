// Children's health, allergy, medication and emergency details (CLAUDE.md,
// rule 3): never in lists, exports, emails, screenshots, logs or AI
// prompts; shown only to that business's authorised staff, behind the team
// permission; purged 90 days after the programme ends
// (purge_expired_health_details, nightly, logged to audit_log).
//
// This file is the one list of those columns, and the one way to take
// them off a record before it goes anywhere wide. lib/health.static.test.ts
// holds the code to it: only the named files may select these columns,
// and no email, CSV or export module may mention them.

// What a parent wrote about the child's health. Blanked by the purge.
export const HEALTH_COLUMNS = ["allergies", "medical_conditions", "medications", "special_needs", "additional_notes", "medical_info_source"] as const;
// Who to call and who may collect the child. Kept while the registration
// is live; never in a list or an export either.
export const EMERGENCY_COLUMNS = ["emergency_contact_name", "emergency_contact_phone", "authorized_pickup"] as const;
export const PROTECTED_CHILD_COLUMNS = [...HEALTH_COLUMNS, ...EMERGENCY_COLUMNS] as const;

export type ProtectedChildColumn = (typeof PROTECTED_CHILD_COLUMNS)[number];

const camel = (column: string) => column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
// Both spellings, since rows are snake_case and the app's own records camelCase.
const PROTECTED_KEYS: ReadonlySet<string> = new Set(PROTECTED_CHILD_COLUMNS.flatMap((column) => [column, camel(column)]));

export function isProtectedChildKey(key: string): boolean {
  return PROTECTED_KEYS.has(key);
}

// The same record without any protected field, for anything that is a
// list, an export or an email. The input is not changed.
export function redactHealth<T extends Record<string, unknown>>(row: T): Omit<T, ProtectedChildColumn | "allergies"> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) if (!PROTECTED_KEYS.has(key)) out[key] = value;
  return out as Omit<T, ProtectedChildColumn | "allergies">;
}

export function redactHealthAll<T extends Record<string, unknown>>(rows: readonly T[]): Array<Omit<T, ProtectedChildColumn | "allergies">> {
  return rows.map(redactHealth);
}

// True when a column list (as handed to .select()) names a protected column.
export function selectsProtectedColumn(select: string): boolean {
  return select.split(/[\s,()]+/).some((part) => isProtectedChildKey(part));
}
