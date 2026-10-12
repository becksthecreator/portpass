import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Brief 31 (D): what the passport screens say. No card or money-holding
// words (CLAUDE.md rules 1 and 2), no "platform" talk, and no health
// details: the only mention is the line telling a coach not to write them.
// The family's page reads nothing from the database itself; the passport
// comes only through the lookup, after the code and date of birth match.
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const screens = ["app/futprep/staff/coach/PassportPanel.tsx", "app/futprep/my/LookupForm.tsx"];

describe("the passport screens' words (brief 31, D)", () => {
  it("never mention cards, holding money, or platforms", () => {
    for (const file of screens) {
      const text = read(file);
      expect(text, file).not.toMatch(/\b(card payments?|credit card|debit card|pay by card|wallet|escrow|balance held|platform|solution|SaaS)\b/i);
    }
  });

  it("name health only to say it doesn't belong in a note", () => {
    const panel = read("app/futprep/staff/coach/PassportPanel.tsx");
    expect(panel).toContain("No health or medical details here");
    expect(panel).not.toMatch(/\b(allerg|medication|special needs|emergency contact)/i);
  });

  it("the family's page imports nothing from the database", () => {
    expect(read("app/futprep/my/[code]/page.tsx")).not.toMatch(/from "@\/db\//);
    expect(read("app/futprep/my/LookupForm.tsx")).not.toMatch(/from "@\/db\//);
  });
});
