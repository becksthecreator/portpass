import { describe, expect, it } from "vitest";
import { isQuietPath } from "./neverList";

describe("the motion never-list (brief 22)", () => {
  it("keeps every never-list place still", () => {
    for (const path of [
      "/login",
      "/signup",
      "/account",
      "/account/pass",
      "/admin",
      "/admin/content",
      "/business/futprep/payments",
      "/futprep/register",
      "/futprep/register/return/abc",
      "/futprep/trial",
      "/futprep/my",
      "/futprep/staff/login",
      "/weddings/staff/login",
      "/weddings/admin/packages",
      "/weddings/bahamas-weddings-by-the-sea/plan",
      "/sports-fitness/futprep/book",
      "/entertainment/some-venue/register",
      "/booking/abc123",
      "/pay/abc123",
      "/pass",
      "/demo/payments",
      "/shop",
      "/organizations",
      "/claim",
    ]) {
      expect(isQuietPath(path), path).toBe(true);
    }
  });

  it("lets the public pages move", () => {
    for (const path of ["/", "/pricing", "/about", "/apply", "/business", "/weddings", "/sports-fitness", "/entertainment", "/entertainment/djs", "/sports-fitness/futprep", "/perks"]) {
      expect(isQuietPath(path), path).toBe(false);
    }
  });
});
