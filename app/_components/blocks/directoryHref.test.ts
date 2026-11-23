import { describe, expect, it } from "vitest";
import { FUTPREP_SITE } from "@/lib/futprepOffSite";
import { absoluteUrl } from "@/lib/seo/jsonLd";
import { directoryHref } from "./directoryHref";

describe("directoryHref", () => {
  it("sends Futprep's card straight to Futprep's own site (no prefetch of a redirect)", () => {
    expect(directoryHref("futprep", "sports-fitness")).toBe(FUTPREP_SITE);
    // Structured data keeps it as it is.
    expect(absoluteUrl(directoryHref("futprep", "sports-fitness"))).toBe(FUTPREP_SITE);
  });

  it("keeps the other pages on PortPass", () => {
    expect(directoryHref("bahamas-weddings", "weddings")).toBe("/weddings/bahamas-weddings-by-the-sea");
    expect(directoryHref("carv-performance", "sports-fitness")).toBe("/sports-fitness/carv-performance");
    expect(directoryHref("no-section", null)).toBe("/no-section");
  });
});
