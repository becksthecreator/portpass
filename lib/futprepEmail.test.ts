import { describe, expect, it } from "vitest";
import { AA, contrast } from "./businessTheme";
import { futprepEmailButton, futprepEmailLink, futprepEmailShell } from "./futprepEmail";
import { FLAMINGO_NIGHT } from "./futprepTheme";

// Flamingo Night in the inbox (brief 27, D).
describe("the Futprep email shell", () => {
  const html = futprepEmailShell("Registration <received>", "<p>Hi</p>");

  it("has a navy header with the academy's name in mint and the title in base", () => {
    expect(html).toContain(`background:${FLAMINGO_NIGHT["--fp-navy"]}`);
    expect(html).toContain(`color:${FLAMINGO_NIGHT["--fp-mint"]}`);
    expect(html).toContain("FUTPREP ATHLETICS");
    expect(html).toContain(`color:${FLAMINGO_NIGHT["--fp-base"]}`);
    expect(html).toContain("Registration &lt;received&gt;");
    expect(html).toContain("<p>Hi</p>");
    expect(html).toContain("Futprep Athletics · Sent via PortPass");
  });

  it("the button is pink with navy words, never white, and escapes what it is given", () => {
    const button = futprepEmailButton("https://portpassbahamas.com/futprep/my/FP-1?a=1&b=2", "Check <status> →");
    expect(button).toContain(`background:${FLAMINGO_NIGHT["--fp-pink"]};color:${FLAMINGO_NIGHT["--fp-navy"]}`);
    expect(button).not.toMatch(/color:#fff/i);
    expect(button).toContain('href="https://portpassbahamas.com/futprep/my/FP-1?a=1&amp;b=2"');
    expect(button).toContain("Check &lt;status&gt; →");
    expect(contrast(FLAMINGO_NIGHT["--fp-navy"], FLAMINGO_NIGHT["--fp-pink"])).toBeGreaterThanOrEqual(AA);
  });

  it("refuses a link that isn't an absolute http(s) address", () => {
    expect(() => futprepEmailButton("javascript:alert(1)", "Go")).toThrow();
    expect(() => futprepEmailLink("/futprep/my", "Go")).toThrow();
  });

  it("a plain link is the deep pink, which reads on white", () => {
    const link = futprepEmailLink("https://portpassbahamas.com", "PortPass");
    expect(link).toContain(`color:${FLAMINGO_NIGHT["--fp-pink-deep"]}`);
    expect(contrast(FLAMINGO_NIGHT["--fp-pink-deep"], "#FFFFFF")).toBeGreaterThanOrEqual(AA);
  });
});
