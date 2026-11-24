import { describe, expect, it } from "vitest";
import { familyDetails, type FamilyRegistrationRow } from "./futprepFamily";

const row = (over: Partial<FamilyRegistrationRow> = {}): FamilyRegistrationRow => ({
  parentName: "TEST Parent", parentPhone: "242-555-0101", relationship: "Mother", childName: "TEST Ava Rolle",
  childDob: "2024-08-14", gender: "Female", submittedAt: "2026-09-10T10:00:00Z", ...over,
});

describe("Use my details (register V4)", () => {
  it("gives the newest parent details and each child once, newest first", () => {
    const out = familyDetails([
      row({ submittedAt: "2026-01-10T10:00:00Z", parentPhone: "242-555-0100" }),
      row(),
      row({ childName: "TEST Ben Rolle", childDob: "2022-02-01", gender: "Not given", submittedAt: "2026-09-11T10:00:00Z" }),
    ]);
    expect(out.parent).toEqual({ name: "TEST Parent", phone: "242-555-0101", relationship: "Mother" });
    expect(out.children).toEqual([
      { name: "TEST Ben Rolle", firstName: "TEST", dob: "2022-02-01", gender: null },
      { name: "TEST Ava Rolle", firstName: "TEST", dob: "2024-08-14", gender: "Female" },
    ]);
  });

  it("returns only the fields Privacy v3 names", () => {
    const out = familyDetails([row()]);
    expect(Object.keys(out.parent!).sort()).toEqual(["name", "phone", "relationship"]);
    expect(Object.keys(out.children[0]).sort()).toEqual(["dob", "firstName", "gender", "name"]);
  });

  it("is empty for a family with no registrations, and caps the children", () => {
    expect(familyDetails([])).toEqual({ parent: null, children: [] });
    const many = Array.from({ length: 9 }, (_, i) => row({ childName: `TEST Child ${i}`, childDob: `2020-01-0${i + 1}` }));
    expect(familyDetails(many).children).toHaveLength(6);
  });
});
