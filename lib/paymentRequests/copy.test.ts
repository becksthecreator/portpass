import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Brief 17: "Never say or imply that card payments work." Every screen and
// email of payment requests is read here for card wording, and the
// customer's page must carry the brief's words exactly.

const root = join(__dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? files(path) : /\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const SOURCES = [...files("app/pay"), ...files("app/_components/payments"), ...files("app/admin/payments"), "lib/paymentRequests/email.ts", "lib/paymentRequests/rules.ts"];

describe("payment request copy", () => {
  it("never offers or mentions paying by card", () => {
    expect(SOURCES.length).toBeGreaterThan(10);
    for (const path of SOURCES) {
      const text = readFileSync(join(root, path), "utf8");
      expect(text, path).not.toMatch(/(credit|debit)\s+card|card\s+(payment|number|details|fields?)|pay(ing)?\s+(now|by\s+card|with\s+(a\s+)?card)|\bcvv\b|\bcvc\b|expiry\s+date|card\s+payments?\s+(work|are\s+available)/i);
    }
  });

  it("tells the customer to pay the business directly, word for word", () => {
    const page = readFileSync(join(root, "app/pay/[token]/page.tsx"), "utf8");
    expect(page).toContain("Pay {business.name} directly. PortPass never holds your money.");
  });
});
