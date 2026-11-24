// "Use my details" on the FutPrep register (V4, PR 2). A parent who has
// proved their email (signed in to PortPass) gets back what Privacy v3
// says the form may fill in: their name, phone and relationship, and each
// child's name, date of birth and gender, from earlier registrations, and
// nothing more (the class is picked from the birthday, not looked up).
// Never a health, allergy, medication, emergency-contact or pickup field
// (rule 3): those columns are not read at all (db/futprepFamily.ts).

export type FamilyRegistrationRow = {
  parentName: string;
  parentPhone: string;
  relationship: string;
  childName: string;
  childDob: string | null;
  gender: string;
  submittedAt: string;
};

export type FamilyDetails = {
  parent: { name: string; phone: string; relationship: string } | null;
  children: Array<{ name: string; firstName: string; dob: string | null; gender: string | null }>;
};

const MAX_CHILDREN = 6;
const tidy = (value: string) => value.trim().replace(/\s+/g, " ");

// Gender the quick form records when it doesn't ask ("Not given") is left
// blank, so the new form asks rather than shows a placeholder.
const realGender = (value: string) => {
  const g = tidy(value);
  return g && g.toLowerCase() !== "not given" ? g : null;
};

export function familyDetails(rows: readonly FamilyRegistrationRow[]): FamilyDetails {
  const newestFirst = [...rows].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const latest = newestFirst[0];
  const children = new Map<string, FamilyDetails["children"][number]>();
  for (const row of newestFirst) {
    const name = tidy(row.childName);
    if (!name) continue;
    // One child per name and date of birth; the newest registration wins.
    const key = `${name.toLowerCase()}|${row.childDob ?? ""}`;
    if (children.has(key)) continue;
    children.set(key, { name, firstName: name.split(" ")[0], dob: row.childDob, gender: realGender(row.gender) });
    if (children.size >= MAX_CHILDREN) break;
  }
  return {
    parent: latest ? { name: tidy(latest.parentName), phone: tidy(latest.parentPhone), relationship: tidy(latest.relationship) } : null,
    children: [...children.values()],
  };
}
