import { describe, expect, it } from "vitest";
import { missingLines, type MissingInput } from "./opsMissing";

const done = { name: "TEST Coach Done", active: true, memberType: "coach", photoUrl: "https://example.com/p.jpg", workingDays: [1, 3], login: { linked: true, hasEmail: true, hasPin: true, active: true }, leadPayCents: 5000 };

describe("the operating map's Missing list (brief 31, B2)", () => {
  it("says nothing when everything is in", () => {
    const input: MissingInput = { locations: [{ name: "TEST Field", active: true, costModel: "per_hour", costCents: 4000 }, { name: "TEST School", active: true, costModel: "school_pays", costCents: null }], coaches: [done] };
    expect(missingLines(input)).toEqual([]);
  });

  it("one line per gap, each linking to the screen that fixes it", () => {
    const input: MissingInput = {
      locations: [{ name: "TEST Field", active: true, costModel: null, costCents: null }, { name: "TEST Gym", active: true, costModel: "per_session", costCents: null }],
      coaches: [
        { ...done, name: "TEST Coach New", login: { linked: true, hasEmail: false, hasPin: false, active: true }, photoUrl: null, workingDays: [], leadPayCents: null },
        { ...done, name: "TEST Coach Unlinked", login: null },
      ],
    };
    expect(missingLines(input)).toEqual([
      { kind: "cost", who: "TEST Field", text: "TEST Field: no cost yet", href: "/futprep/staff/locations" },
      { kind: "cost", who: "TEST Gym", text: "TEST Gym: no cost yet", href: "/futprep/staff/locations" },
      { kind: "email", who: "TEST Coach New", text: "TEST Coach New: no email", href: "/futprep/staff/accounts" },
      { kind: "pin", who: "TEST Coach New", text: "TEST Coach New: no PIN yet", href: "/futprep/staff/accounts" },
      { kind: "photo", who: "TEST Coach New", text: "TEST Coach New: no photo", href: "/futprep/staff/team" },
      { kind: "days", who: "TEST Coach New", text: "TEST Coach New: no working days", href: "/futprep/staff/team" },
      { kind: "pay_rate", who: "TEST Coach New", text: "TEST Coach New: no pay rate", href: "/futprep/staff/pay" },
      { kind: "login", who: "TEST Coach Unlinked", text: "TEST Coach Unlinked: no staff login", href: "/futprep/staff/accounts" },
    ]);
  });

  it("asks for private session pay for a coach who takes private sessions (brief 31, C5)", () => {
    const input: MissingInput = { locations: [], coaches: [{ ...done, takesPrivate: true, privatePayCents: { private30: null, private60: null } }, { ...done, name: "TEST Coach Set", takesPrivate: true, privatePayCents: { private30: 2000, private60: null } }] };
    expect(missingLines(input)).toEqual([{ kind: "pay_rate", who: "TEST Coach Done", text: "TEST Coach Done: no private session pay", href: "/futprep/staff/ops#ops-pay" }]);
  });

  it("leaves out switched-off places, hidden coaches and non-coaches", () => {
    const input: MissingInput = {
      locations: [{ name: "TEST Old field", active: false, costModel: null, costCents: null }],
      coaches: [{ ...done, active: false, photoUrl: null }, { ...done, memberType: "relations", photoUrl: null }],
    };
    expect(missingLines(input)).toEqual([]);
  });
});
