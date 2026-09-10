import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Futprep Out East Lil Kickers")).toBe("futprep-out-east-lil-kickers");
  });

  it("collapses punctuation and repeated separators into single hyphens", () => {
    expect(slugify("Coach Bex's  Speed & Agility!!")).toBe("coach-bex-s-speed-agility");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--Ready?--")).toBe("ready");
  });

  it("falls back to a default when the name slugifies to nothing", () => {
    expect(slugify("!!!")).toBe("program");
    expect(slugify("")).toBe("program");
  });

  it("truncates very long names", () => {
    const longName = "a".repeat(200);
    expect(slugify(longName).length).toBe(60);
  });
});
