import { describe, expect, it } from "vitest";
import { attributionFromRequest, EMPTY_ATTRIBUTION, mergeAttribution, parseAttributionCookie, resolveAttribution, serializeAttributionCookie } from "./attribution";

const qr = { ...EMPTY_ATTRIBUTION, utmSource: "portpass", utmMedium: "qr", utmCampaign: "term2_field_banner" };

describe("resolveAttribution (handbook v1.3 §5)", () => {
  it("a new family from the PortPass QR is commissionable, reason 'PortPass QR'", () => {
    expect(resolveAttribution({ heard: "qr", referralCode: null, attribution: qr, isNewFamily: true })).toEqual({ sourceChannel: "qr", commissionEligible: true, commissionReason: "PortPass QR" });
  });

  it("the same family again (a sibling) is not new and not eligible", () => {
    const r = resolveAttribution({ heard: "referral", referralCode: null, attribution: qr, isNewFamily: false });
    expect(r.commissionEligible).toBe(false);
    expect(r.commissionReason).toMatch(/^Returning family/);
  });

  it("'Instagram' with no PortPass link is recorded but not eligible", () => {
    const r = resolveAttribution({ heard: "instagram", referralCode: null, attribution: EMPTY_ATTRIBUTION, isNewFamily: true });
    expect(r).toEqual({ sourceChannel: "instagram", commissionEligible: false, commissionReason: "Self-reported Instagram, no PortPass link" });
  });

  it("self-reported 'Browsing PortPass' is not enough on its own", () => {
    expect(resolveAttribution({ heard: "portpass_listing", referralCode: null, attribution: EMPTY_ATTRIBUTION, isNewFamily: true }).commissionEligible).toBe(false);
  });

  it("arriving from a PortPass page counts as found on PortPass", () => {
    const r = resolveAttribution({ heard: "portpass_listing", referralCode: null, attribution: { ...EMPTY_ATTRIBUTION, viaPortpass: true }, isNewFamily: true });
    expect(r).toEqual({ sourceChannel: "portpass_listing", commissionEligible: true, commissionReason: "Found on PortPass" });
  });

  it("a PortPass referral code counts; a friend's name does not", () => {
    expect(resolveAttribution({ heard: "referral", referralCode: "pp-alex1", attribution: EMPTY_ATTRIBUTION, isNewFamily: true }).commissionEligible).toBe(true);
    const friend = resolveAttribution({ heard: "referral", referralCode: "Auntie Kim", attribution: EMPTY_ATTRIBUTION, isNewFamily: true });
    expect(friend.commissionEligible).toBe(false);
    expect(friend.sourceChannel).toBe("referral");
  });

  it("an Instagram bio link we control counts as a PortPass link", () => {
    const r = resolveAttribution({ heard: "instagram", referralCode: null, attribution: { ...EMPTY_ATTRIBUTION, utmSource: "portpass", utmMedium: "ig_bio" }, isNewFamily: true });
    expect(r).toEqual({ sourceChannel: "portpass_link", commissionEligible: true, commissionReason: "PortPass link" });
  });
});

describe("attribution cookie", () => {
  it("reads UTM tags and an external referrer host, never the full URL", () => {
    const a = attributionFromRequest({ searchParams: new URLSearchParams("utm_source=portpass&utm_medium=qr&utm_campaign=term2_field_banner"), referer: "https://www.instagram.com/p/abc?x=1", ownHost: "portpassbahamas.com" });
    expect(a).toEqual({ utmSource: "portpass", utmMedium: "qr", utmCampaign: "term2_field_banner", referrerHost: "instagram.com", viaPortpass: false });
  });

  it("notes an arrival from a PortPass page that is not a Futprep page", () => {
    expect(attributionFromRequest({ searchParams: new URLSearchParams(), referer: "https://portpassbahamas.com/sports-fitness", ownHost: "portpassbahamas.com" })).toEqual({ ...EMPTY_ATTRIBUTION, viaPortpass: true });
    expect(attributionFromRequest({ searchParams: new URLSearchParams(), referer: "https://portpassbahamas.com/sports-fitness/futprep-athletics", ownHost: "portpassbahamas.com" })).toBeNull();
  });

  it("keeps the first touch unless a PortPass link arrives later", () => {
    const ig = { ...EMPTY_ATTRIBUTION, referrerHost: "instagram.com" };
    expect(mergeAttribution(ig, { ...EMPTY_ATTRIBUTION, viaPortpass: true })).toEqual(ig);
    expect(mergeAttribution(ig, qr)).toEqual(qr);
    expect(mergeAttribution(null, ig)).toEqual(ig);
  });

  it("round-trips through the cookie value and rejects junk", () => {
    expect(parseAttributionCookie(serializeAttributionCookie(qr))).toEqual(qr);
    expect(parseAttributionCookie("not json")).toBeNull();
    expect(parseAttributionCookie(encodeURIComponent('{"r":"<script>"}'))).toBeNull();
  });
});
