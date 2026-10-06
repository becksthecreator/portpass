import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { HEALTH_COLUMNS, PROTECTED_CHILD_COLUMNS, redactHealth, redactHealthAll, selectsProtectedColumn } from "./health";

describe("redactHealth", () => {
  it("takes every protected field off a record, in either spelling, and leaves the rest", () => {
    const row = { id: 7, child_name: "T.", allergies: "peanuts", medical_conditions: "", medications: null, special_needs: "x", additional_notes: "n", medical_info_source: "parent", emergency_contact_name: "A", emergency_contact_phone: "+1242", authorized_pickup: "B", emergencyContactName: "A", allergiesNote: "keeps", parent_name: "P" };
    const out = redactHealth(row);
    expect(out).toEqual({ id: 7, child_name: "T.", allergiesNote: "keeps", parent_name: "P" });
    expect(row.allergies).toBe("peanuts");
    expect(redactHealthAll([row]).length).toBe(1);
  });

  it("recognises a select list that names a protected column", () => {
    expect(selectsProtectedColumn("id,child_name,allergies,medications")).toBe(true);
    expect(selectsProtectedColumn("id, reference_code, parent_name")).toBe(false);
    expect(selectsProtectedColumn("emergency_contact_phone")).toBe(true);
    expect(HEALTH_COLUMNS).toContain("allergies");
    expect(PROTECTED_CHILD_COLUMNS.length).toBe(9);
  });
});

// The code to rule 3, read against the source. Only these files may ask
// the database for a protected column; each is a screen for that
// business's own authorised staff, a write path, or the admin reveal that
// is itself audited and rate-limited. Anything else that names one fails
// here, before it ships.
const MAY_SELECT_PROTECTED = new Set<string>([
  "db/registrations.ts", // writes what the parent typed; reads it back for the parent's own record
  "db/staff.ts", // Futprep staff roster and registration detail, behind the staff PIN
  "db/businessRegistrations.ts", // a business's registration detail, behind the team permission (canViewMedical)
  "db/teamsnapImport.ts", // the one-off import of Futprep's old records
  // db/adminBookings.ts (the audited, rate-limited reveal) builds its select
  // from lib/adminBookings.ts HEALTH_FIELDS, so no literal column appears
  // there; the reveal is covered by its own tests.
]);

// Modules that produce something that travels: an email, a CSV, an export,
// a prompt. None may mention a protected column.
const TRAVELLING = /(mail|csv|export|prompt|scout|growth|report)/i;

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.integration\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const repoPath = (file: string) => relative(process.cwd(), file).split(sep).join("/");
const COLUMN = new RegExp(`\\b(${PROTECTED_CHILD_COLUMNS.join("|")})\\b`);

describe("rule 3, read against the source", () => {
  const dbFiles = walk(join(process.cwd(), "db"));

  it("only the named db files select a protected column", () => {
    const offenders = dbFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      // A column named inside .select("...") or a column-list constant.
      const selects = [...source.matchAll(/\.select\(\s*(["'`])([\s\S]*?)\1/g)].map((m) => m[2]);
      const lists = [...source.matchAll(/const [A-Z_]*COLUMNS[A-Z_]* =\s*(["'`])([\s\S]*?)\1/g)].map((m) => m[2]);
      return [...selects, ...lists].some((list) => COLUMN.test(list));
    }).map(repoPath);
    const unexpected = offenders.filter((f) => !MAY_SELECT_PROTECTED.has(f));
    expect(unexpected, `selects a protected column but is not on the list in lib/health.static.test.ts: ${unexpected.join(", ")}`).toEqual([]);
    for (const allowed of MAY_SELECT_PROTECTED) expect(offenders, `${allowed} is on the allow-list but no longer selects a protected column; remove it`).toContain(allowed);
  });

  it("no email, CSV, export, report or prompt module names a protected column", () => {
    const files = [...walk(join(process.cwd(), "lib")), ...walk(join(process.cwd(), "app", "api"))].filter((file) => TRAVELLING.test(repoPath(file)) && repoPath(file) !== "lib/health.ts" && repoPath(file) !== "lib/health.static.test.ts");
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8").replace(/\/\/[^\n]*/g, "");
      return COLUMN.test(source);
    }).map(repoPath);
    expect(offenders, `mentions a protected column outside a comment: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the roster CSV has no column for any of them", () => {
    const source = readFileSync(join(process.cwd(), "lib/rosterCsv.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
    expect(COLUMN.test(source)).toBe(false);
    for (const word of ["Allergies", "Medications", "Medical", "Emergency"]) expect(source.includes(`"${word}`), `${word} is a roster CSV column`).toBe(false);
  });
});
