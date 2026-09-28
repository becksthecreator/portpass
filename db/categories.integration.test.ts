import { describe, expect, it } from "vitest";
import { listSections } from "./categories";
import { SECTIONS } from "@/lib/sections";

// One source of truth for sections (round 5, §1): the categories table is
// what the site reads; lib/sections.ts is the compiled mirror used when
// there is no database and by client forms. This fails the build the
// moment a migration and the mirror disagree, in either direction.
describe("sections: one source of truth", () => {
  it("the compiled mirror matches the visible categories table, in order", async () => {
    const fromDb = (await listSections()).map((s) => ({
      slug: s.slug,
      name: s.name,
      subsections: s.subcategories.map((c) => ({ slug: c.slug, name: c.name })),
    }));
    const compiled = SECTIONS.map((s) => ({
      slug: s.slug,
      name: s.name,
      subsections: s.subsections.map((c) => ({ slug: c.slug, name: c.name })),
    }));
    expect(fromDb).toEqual(compiled);
  });
});
