import { describe, expect, it } from "vitest";
import { costLabel, daysLabel, isCosted, parseLocationInput } from "./futprepLocations";

describe("a place as staff type it (brief 31, B1)", () => {
  it("keeps what was typed, with the amount in cents", () => {
    const read = parseLocationInput({ name: "  LCIS   Lower Campus ", area: "Lyford Cay", costModel: "per_hour", cost: "$40.50", costNote: "Alex to confirm", surface: "grass", privateSessionsOk: true, daysAvailable: [3, 1, 3], hoursNote: "After 3 PM" });
    expect(read).toEqual({
      ok: true,
      value: { name: "LCIS Lower Campus", area: "Lyford Cay", address: null, costModel: "per_hour", costCents: 4050, costNote: "Alex to confirm", surface: "grass", privateSessionsOk: true, daysAvailable: [1, 3], hoursNote: "After 3 PM" },
    });
  });

  it("a place may be saved before its cost is known", () => {
    const read = parseLocationInput({ name: "Meridian School", costModel: "per_session", cost: "" });
    expect(read.ok && read.value).toMatchObject({ costModel: "per_session", costCents: null, privateSessionsOk: false, daysAvailable: null });
    const none = parseLocationInput({ name: "Meridian School" });
    expect(none.ok && none.value).toMatchObject({ costModel: null, costCents: null });
  });

  it("free and school-paid places carry no amount, whatever is sent", () => {
    const read = parseLocationInput({ name: "St Andrew's School", costModel: "school_pays", cost: "500" });
    expect(read.ok && read.value.costCents).toBeNull();
  });

  it("refuses what it can't keep", () => {
    expect(parseLocationInput({ name: "" })).toEqual({ ok: false, error: "Give the place a name." });
    expect(parseLocationInput({ name: "Field", costModel: "per_week" })).toMatchObject({ ok: false });
    expect(parseLocationInput({ name: "Field", costModel: "per_hour", cost: "forty" })).toMatchObject({ ok: false });
    expect(parseLocationInput({ name: "Field", costModel: "per_hour", cost: "-5" })).toMatchObject({ ok: false });
    expect(parseLocationInput({ name: "Field", costModel: "per_term", cost: "100001" })).toMatchObject({ ok: false });
    expect(parseLocationInput({ name: "Field", costModel: "per_term", cost: "100000" })).toMatchObject({ ok: true });
    expect(parseLocationInput({ name: "Field", surface: "sand" })).toMatchObject({ ok: false });
    expect(parseLocationInput({ name: "Field", daysAvailable: [0, 8] })).toMatchObject({ ok: false });
    expect(parseLocationInput({ name: "Field", daysAvailable: "Mon" })).toMatchObject({ ok: false });
  });

  it("says what a place costs in plain words", () => {
    expect(costLabel({ costModel: "per_hour", costCents: 4000 })).toBe("$40 an hour");
    expect(costLabel({ costModel: "per_session", costCents: 2550 })).toBe("$25.50 a session");
    expect(costLabel({ costModel: "per_term", costCents: 80000 })).toBe("$800 a term");
    expect(costLabel({ costModel: "free", costCents: null })).toBe("Free");
    expect(costLabel({ costModel: "school_pays", costCents: null })).toBe("The school pays");
    expect(costLabel({ costModel: null, costCents: null })).toBe("Not set");
    expect(costLabel({ costModel: "per_hour", costCents: null })).toBe("Amount not set (an hour)");
  });

  it("a place is costed once the model and, where needed, the amount are in", () => {
    expect(isCosted({ costModel: null, costCents: null })).toBe(false);
    expect(isCosted({ costModel: "per_hour", costCents: null })).toBe(false);
    expect(isCosted({ costModel: "per_hour", costCents: 4000 })).toBe(true);
    expect(isCosted({ costModel: "free", costCents: null })).toBe(true);
  });

  it("names the days", () => {
    expect(daysLabel(null)).toBe("Days not set");
    expect(daysLabel([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(daysLabel([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
  });
});
