// One-off TeamSnap roster import (brief 13, part 5). Pure: parse the CSV,
// map TeamSnap's columns, match rows to pending_details registrations by
// child name, and work out which empty fields each match would fill.
// Nothing here writes, sends or messages anything.
import { normalizePhoneE164 } from "./phone";

// ---- CSV ------------------------------------------------------------------
// RFC 4180: quoted fields, "" for a quote inside one, commas and line breaks
// inside quotes, CRLF or LF, and a leading byte-order mark.
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// ---- Columns --------------------------------------------------------------
export type ImportField =
  | "childFirst" | "childLast" | "childName" | "childDob" | "gender"
  | "parentFirst" | "parentLast" | "parentName" | "parentEmail" | "parentPhone" | "relationship"
  | "emergencyName" | "emergencyPhone" | "authorizedPickup"
  | "allergies" | "medicalConditions" | "medications" | "specialNeeds";

// TeamSnap's roster export and its registration forms name columns in a
// few ways; these are compared after lower-casing and dropping punctuation.
const SYNONYMS: Record<ImportField, string[]> = {
  childFirst: ["first name", "first", "player first name", "participant first name", "child first name", "member first name"],
  childLast: ["last name", "last", "player last name", "participant last name", "child last name", "member last name"],
  childName: ["name", "player name", "participant name", "child name", "childs name", "full name", "member name", "player"],
  childDob: ["birthdate", "birthday", "date of birth", "dob", "birth date", "player birthdate", "child date of birth", "childs date of birth"],
  gender: ["gender", "sex", "player gender"],
  parentFirst: ["contact 1 first name", "parent first name", "guardian first name", "parent 1 first name"],
  parentLast: ["contact 1 last name", "parent last name", "guardian last name", "parent 1 last name"],
  parentName: ["parent name", "parent guardian name", "parentguardian name", "guardian name", "contact 1 name", "parent 1 name", "parent"],
  parentEmail: ["email", "email address", "email address 1", "contact 1 email", "contact 1 email address", "parent email", "guardian email", "parent 1 email"],
  parentPhone: ["phone", "phone number", "mobile", "mobile phone", "cell phone", "contact 1 mobile phone", "contact 1 phone", "contact 1 cell phone", "parent phone", "parent mobile", "guardian phone", "parent 1 phone"],
  relationship: ["relationship", "contact 1 relationship", "relationship to player", "relationship to child"],
  emergencyName: ["emergency contact", "emergency contact name", "emergency name", "emergency contact full name"],
  emergencyPhone: ["emergency phone", "emergency contact phone", "emergency contact number", "emergency number", "emergency contact phone number"],
  authorizedPickup: ["authorized pickup", "authorised pickup", "authorized pick up", "authorised pick up", "pickup", "pick up", "authorized pickup persons"],
  allergies: ["allergies", "allergy", "food allergies"],
  medicalConditions: ["medical conditions", "medical", "medical notes", "health conditions", "medical information"],
  medications: ["medications", "medication", "current medications"],
  specialNeeds: ["special needs", "additional needs", "disabilities", "special needs or disabilities"],
};

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function mapHeaders(headers: string[]): Partial<Record<ImportField, number>> {
  const normalized = headers.map(normalizeHeader);
  const map: Partial<Record<ImportField, number>> = {};
  for (const field of Object.keys(SYNONYMS) as ImportField[]) {
    const index = normalized.findIndex((h) => SYNONYMS[field].includes(h));
    if (index >= 0) map[field] = index;
  }
  return map;
}

// ---- Values ---------------------------------------------------------------
// "03/14/2023", "3/14/23", "2023-03-14" -> "2023-03-14". TeamSnap exports
// US-style month/day. Two-digit years are this century (these are
// children). Anything else: null.
export function parseDate(value: string): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v))) {
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

// For matching: "Ávila-Smith,  Jo" and "avila smith jo" are the same child.
export function nameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type ImportRecord = {
  row: number; // 1-based, counting the header as row 1
  childName: string;
  childDob: string | null;
  gender: string | null;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  relationship: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  authorizedPickup: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  medications: string | null;
  specialNeeds: string | null;
};

export function toRecords(rows: string[][]): { records: ImportRecord[]; mapped: ImportField[]; unmapped: string[] } {
  if (rows.length === 0) return { records: [], mapped: [], unmapped: [] };
  const [headers, ...body] = rows;
  const map = mapHeaders(headers);
  const used = new Set(Object.values(map));
  const cell = (r: string[], field: ImportField): string | null => {
    const index = map[field];
    if (index === undefined) return null;
    const value = (r[index] ?? "").trim();
    return value === "" ? null : value;
  };
  const records = body
    .map((r, i) => {
      const childName = cell(r, "childName") ?? [cell(r, "childFirst"), cell(r, "childLast")].filter(Boolean).join(" ");
      const parentName = cell(r, "parentName") ?? ([cell(r, "parentFirst"), cell(r, "parentLast")].filter(Boolean).join(" ") || null);
      const dob = cell(r, "childDob");
      return {
        row: i + 2,
        childName: childName.trim(),
        childDob: dob ? parseDate(dob) : null,
        gender: cell(r, "gender"),
        parentName,
        parentEmail: cell(r, "parentEmail")?.toLowerCase() ?? null,
        parentPhone: cell(r, "parentPhone"),
        relationship: cell(r, "relationship"),
        emergencyName: cell(r, "emergencyName"),
        emergencyPhone: cell(r, "emergencyPhone"),
        authorizedPickup: cell(r, "authorizedPickup"),
        allergies: cell(r, "allergies"),
        medicalConditions: cell(r, "medicalConditions"),
        medications: cell(r, "medications"),
        specialNeeds: cell(r, "specialNeeds"),
      };
    })
    .filter((record) => record.childName !== "");
  return {
    records,
    mapped: (Object.keys(map) as ImportField[]),
    unmapped: headers.filter((_, i) => !used.has(i)).map((h) => h.trim()).filter(Boolean),
  };
}

// ---- Matching -------------------------------------------------------------
export type ExistingRegistration = {
  id: number;
  referenceCode: string;
  childName: string;
  status: string;
  // The fields the import may fill; null = not on file yet.
  current: Partial<Record<RegistrationColumn, string | null>>;
};

export type RegistrationColumn =
  | "child_dob" | "gender" | "parent_name" | "parent_email" | "parent_phone" | "relationship"
  | "emergency_contact_name" | "emergency_contact_phone" | "authorized_pickup"
  | "allergies" | "medical_conditions" | "medications" | "special_needs";

// Medical columns: filled only when TeamSnap has something, never shown in
// the preview (a count only).
export const MEDICAL_COLUMNS: RegistrationColumn[] = ["allergies", "medical_conditions", "medications", "special_needs"];

export const COLUMN_LABEL: Record<RegistrationColumn, string> = {
  child_dob: "date of birth",
  gender: "gender",
  parent_name: "parent name",
  parent_email: "parent email",
  parent_phone: "parent phone",
  relationship: "relationship",
  emergency_contact_name: "emergency contact",
  emergency_contact_phone: "emergency phone",
  authorized_pickup: "pick-up",
  allergies: "allergies",
  medical_conditions: "medical conditions",
  medications: "medications",
  special_needs: "special needs",
};

function valuesFor(record: ImportRecord): Partial<Record<RegistrationColumn, string | null>> {
  const phone = (value: string | null) => (value ? normalizePhoneE164(value) ?? value : null);
  return {
    child_dob: record.childDob,
    gender: record.gender,
    parent_name: record.parentName,
    parent_email: record.parentEmail,
    parent_phone: phone(record.parentPhone),
    relationship: record.relationship,
    emergency_contact_name: record.emergencyName,
    emergency_contact_phone: phone(record.emergencyPhone),
    authorized_pickup: record.authorizedPickup,
    allergies: record.allergies,
    medical_conditions: record.medicalConditions,
    medications: record.medications,
    special_needs: record.specialNeeds,
  };
}

// Only fields that are empty on the registration and present in TeamSnap:
// the import never overwrites what a parent or staff already entered.
export function plannedFill(record: ImportRecord, existing: ExistingRegistration): Partial<Record<RegistrationColumn, string>> {
  const fill: Partial<Record<RegistrationColumn, string>> = {};
  for (const [column, value] of Object.entries(valuesFor(record)) as Array<[RegistrationColumn, string | null]>) {
    if (!value) continue;
    const current = existing.current[column];
    if (current === null || current === undefined || current === "") fill[column] = value;
  }
  return fill;
}

export type PlanRow = {
  row: number;
  childName: string;
  status: "fill" | "nothing_new" | "no_match" | "ambiguous" | "not_pending";
  registrationId: number | null;
  referenceCode: string | null;
  fill: Partial<Record<RegistrationColumn, string>>;
};

export function planImport(records: ImportRecord[], registrations: ExistingRegistration[]): PlanRow[] {
  const byName = new Map<string, ExistingRegistration[]>();
  for (const reg of registrations) {
    const key = nameKey(reg.childName);
    byName.set(key, [...(byName.get(key) ?? []), reg]);
  }
  return records.map((record) => {
    const candidates = byName.get(nameKey(record.childName)) ?? [];
    const base = { row: record.row, childName: record.childName, registrationId: null, referenceCode: null, fill: {} };
    if (candidates.length === 0) return { ...base, status: "no_match" as const };
    if (candidates.length > 1) return { ...base, status: "ambiguous" as const };
    const reg = candidates[0];
    const matched = { ...base, registrationId: reg.id, referenceCode: reg.referenceCode };
    if (reg.status !== "pending_details") return { ...matched, status: "not_pending" as const };
    const fill = plannedFill(record, reg);
    return { ...matched, fill, status: Object.keys(fill).length ? ("fill" as const) : ("nothing_new" as const) };
  });
}

// What the preview shows for a row: field names, and medical as a count.
export function describeFill(fill: Partial<Record<RegistrationColumn, string>>): string[] {
  const columns = Object.keys(fill) as RegistrationColumn[];
  const plain = columns.filter((c) => !MEDICAL_COLUMNS.includes(c)).map((c) => COLUMN_LABEL[c]);
  const medical = columns.filter((c) => MEDICAL_COLUMNS.includes(c)).length;
  return medical ? [...plain, `medical notes (${medical})`] : plain;
}
