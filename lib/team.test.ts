import { describe, expect, it } from "vitest";
import { initialsOf } from "./team";

describe("initialsOf", () => {
  it("drops the Coach title and any bracketed nickname", () => {
    expect(initialsOf("Coach Andre Roberts")).toBe("AR");
    expect(initialsOf("Keione Rayside (Kiki)")).toBe("KR");
    expect(initialsOf("Coach Antonio Beckford Jr")).toBe("AB");
    expect(initialsOf("Coach")).toBe("F");
  });
});
