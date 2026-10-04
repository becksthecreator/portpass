import { describe, expect, it } from "vitest";
import { consentText, isAdultRegistration, registrationMethods, registrationSteps } from "./business";

describe("who a registration is for", () => {
  it("is an adult's on an adults' programme, a child's on a children's one, and the registrant's answer on a mixed one", () => {
    expect(isAdultRegistration("adults", false)).toBe(true);
    expect(isAdultRegistration("children", true)).toBe(false);
    expect(isAdultRegistration("mixed", true)).toBe(true);
    expect(isAdultRegistration("mixed", false)).toBe(false);
  });

  it("never shows an adult the child or health steps", () => {
    expect(registrationSteps(true)).toEqual(["class", "you", "consent"]);
    expect(registrationSteps(false)).toEqual(["class", "you", "child", "health", "consent"]);
  });

  it("words the consent for the person giving it", () => {
    const adult = consentText("TEST Gym", true);
    expect(adult).toContain("I am 18 or older");
    expect(adult).not.toMatch(/child|health information|first aid/);
    const child = consentText("TEST Gym", false);
    expect(child).toContain("parent/legal guardian");
    expect(child).toContain("TEST Gym staff");
  });
});

describe("how a registration can be paid", () => {
  it("offers only what the business chose, of cash and bank transfer, and never a card", () => {
    expect(registrationMethods(["cash", "bank_transfer", "kanoo_wallet_manual"])).toEqual(["bank_transfer", "cash"]);
    expect(registrationMethods(["kanoo_wallet_manual"])).toEqual([]);
    expect(registrationMethods(["card", "cash"])).toEqual(["cash"]);
    expect(registrationMethods([])).toEqual([]);
  });
});
