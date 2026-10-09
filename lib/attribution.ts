// Where a Futprep family came from (growth-tracking brief, 28 Sept). Pure
// helpers shared by the middleware (which keeps the first-party cookie),
// the registration page and form, the API route and the tests. No server
// imports here.
//
// Handbook v1.3 §5 "Brought by PortPass": commission applies only to a NEW
// family that registered through PortPass with a source recorded (a
// PortPass link, QR, listing, member perk or PortPass referral code). A
// self-reported answer alone ("Instagram") is never enough. When in doubt,
// it is not commissionable.

export const SOURCE_CHANNELS = [
  "portpass_listing",
  "portpass_link",
  "qr",
  "instagram",
  "google",
  "whatsapp",
  "referral",
  "member_perk",
  "word_of_mouth",
  "school",
  "other",
  "unknown",
] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];
export type HeardAnswer = Exclude<SourceChannel, "unknown">;

// The dropdown on the form, in the order shown. "unknown" is never offered.
export const HEARD_OPTIONS: { value: HeardAnswer; label: string }[] = [
  { value: "portpass_listing", label: "Browsing PortPass" },
  { value: "portpass_link", label: "A PortPass link" },
  { value: "qr", label: "Scanned a QR code" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referral", label: "A friend or family member" },
  { value: "member_perk", label: "A PortPass member perk" },
  { value: "word_of_mouth", label: "Word of mouth" },
  { value: "school", label: "School" },
  { value: "other", label: "Other" },
];

export function isHeardAnswer(value: string): value is HeardAnswer {
  return HEARD_OPTIONS.some((o) => o.value === value);
}

export function heardLabel(value: HeardAnswer): string {
  return HEARD_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// The links we control. The QR on the field banner and the Instagram bio
// link both carry utm_source=portpass, which is what makes them count.
export const FUTPREP_LINKS = {
  qrBanner: "https://portpassbahamas.com/futprep?utm_source=portpass&utm_medium=qr&utm_campaign=term2_field_banner",
  instagramShort: "https://portpassbahamas.com/futprep/ig",
  instagramTarget: "/sports-fitness/futprep-athletics?utm_source=portpass&utm_medium=ig_bio&utm_campaign=term2_ig",
} as const;

// Referral codes PortPass hands out start with this; anything else is a
// friend's name or a code we didn't issue, which is not commissionable.
export const PORTPASS_REFERRAL_PREFIX = "PP-";
export function isPortpassReferralCode(code: string | null | undefined): boolean {
  return Boolean(code && code.trim().toUpperCase().startsWith(PORTPASS_REFERRAL_PREFIX));
}

// First-party attribution cookie, 30 days. Attribution only: UTM tags, an
// external referrer's host, and whether the visitor reached Futprep from
// another PortPass page. No identifiers, no IP, no ad trackers.
export const ATTRIBUTION_COOKIE = "pp_attr";
export const ATTRIBUTION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const FUTPREP_PATH_PREFIXES = ["/futprep", "/sports-fitness/futprep-athletics"] as const;
export function isFutprepPath(pathname: string): boolean {
  return FUTPREP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Shops (brief 15): the same first-party attribution, one cookie per shop
// (pp_shop_<org slug>), so a visit to one shop never counts for another.
// The reservation route reads the cookie of the shop being ordered from.
export const SHOP_ATTRIBUTION_COOKIE_PREFIX = "pp_shop_";
export function shopSlugFromPath(pathname: string): string | null {
  const match = /^\/shop\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(pathname);
  return match ? match[1] : null;
}
export function shopAttributionCookie(orgSlug: string): string {
  return `${SHOP_ATTRIBUTION_COOKIE_PREFIX}${orgSlug}`;
}
export function isShopOwnPath(orgSlug: string): (pathname: string) => boolean {
  return (pathname) => pathname === `/shop/${orgSlug}` || pathname.startsWith(`/shop/${orgSlug}/`);
}

export type Attribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerHost: string | null;
  // Reached a Futprep page from a PortPass page that is not itself a
  // Futprep page (home, a section page, the Browse sheet): found on PortPass.
  viaPortpass: boolean;
};

export const EMPTY_ATTRIBUTION: Attribution = { utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, viaPortpass: false };

const TAG_MAX = 80;
// A UTM tag as it may be stored: letters, digits and a few marks, 80 at most.
export function tag(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().slice(0, TAG_MAX);
  return v && /^[\w.\-:+ ]+$/.test(v) ? v : null;
}

const HOST_RE = /^[a-z0-9.-]{1,120}$/;

// "https://www.instagram.com/p/abc" -> "instagram.com". Host only, ever.
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return HOST_RE.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function cleanHost(value: string | null | undefined): string | null {
  const host = (value ?? "").trim().toLowerCase();
  return host && HOST_RE.test(host) ? host : null;
}

function sameSite(refererHost: string | null, ownHost: string | null): boolean {
  if (!refererHost || !ownHost) return false;
  const own = ownHost.toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
  return refererHost === own;
}

// What one request says on its own: its UTM tags and where it came from.
// Returns null when there is nothing worth recording.
// isOwnPath: pages that belong to the business itself (Futprep by default;
// one shop for /shop/<org>), so moving between them is not "found on
// PortPass".
export function attributionFromRequest(input: { searchParams: URLSearchParams; referer: string | null; ownHost: string | null; isOwnPath?: (pathname: string) => boolean }): Attribution | null {
  const utmSource = tag(input.searchParams.get("utm_source"));
  const utmMedium = tag(input.searchParams.get("utm_medium"));
  const utmCampaign = tag(input.searchParams.get("utm_campaign"));
  const refererHost = hostOf(input.referer);
  const internal = sameSite(refererHost, input.ownHost);
  let refererPath: string | null = null;
  if (internal && input.referer) {
    try {
      refererPath = new URL(input.referer).pathname;
    } catch {
      refererPath = null;
    }
  }
  const isOwnPath = input.isOwnPath ?? isFutprepPath;
  const viaPortpass = internal && refererPath !== null && !isOwnPath(refererPath);
  const referrerHost = internal ? null : refererHost;
  if (!utmSource && !utmMedium && !utmCampaign && !referrerHost && !viaPortpass) return null;
  return { utmSource, utmMedium, utmCampaign, referrerHost, viaPortpass };
}

// First touch wins, except that a PortPass link (utm_source=portpass) is
// always recorded: it is the evidence the commission rests on.
export function mergeAttribution(existing: Attribution | null, incoming: Attribution | null): Attribution | null {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (incoming.utmSource) return { ...incoming, viaPortpass: incoming.viaPortpass || existing.viaPortpass };
  return existing;
}

type CookieShape = { s?: string; m?: string; c?: string; r?: string; v?: 1 };

export function serializeAttributionCookie(a: Attribution): string {
  const shape: CookieShape = {};
  if (a.utmSource) shape.s = a.utmSource;
  if (a.utmMedium) shape.m = a.utmMedium;
  if (a.utmCampaign) shape.c = a.utmCampaign;
  if (a.referrerHost) shape.r = a.referrerHost;
  if (a.viaPortpass) shape.v = 1;
  return encodeURIComponent(JSON.stringify(shape));
}

export function parseAttributionCookie(value: string | undefined | null): Attribution | null {
  if (!value) return null;
  try {
    const shape = JSON.parse(decodeURIComponent(value)) as CookieShape;
    if (!shape || typeof shape !== "object") return null;
    const a: Attribution = {
      utmSource: tag(shape.s),
      utmMedium: tag(shape.m),
      utmCampaign: tag(shape.c),
      referrerHost: cleanHost(shape.r),
      viaPortpass: shape.v === 1,
    };
    return a.utmSource || a.utmMedium || a.utmCampaign || a.referrerHost || a.viaPortpass ? a : null;
  } catch {
    return null;
  }
}

export type Resolved = { sourceChannel: SourceChannel; commissionEligible: boolean; commissionReason: string };

// The rule, in one place. Evidence we control (a PortPass UTM link, a
// PortPass referral code, arriving from a PortPass page) sets the channel
// and makes the family commissionable if it is new. Otherwise the parent's
// own answer is recorded as the channel and the reason says why it does
// not count.
export function resolveAttribution(input: { heard: HeardAnswer | null; referralCode: string | null; attribution: Attribution; isNewFamily: boolean }): Resolved {
  const { heard, referralCode, attribution, isNewFamily } = input;
  let channel: SourceChannel;
  let evidence: string | null = null;
  let why = "";

  if ((attribution.utmSource ?? "").toLowerCase() === "portpass") {
    const medium = (attribution.utmMedium ?? "").toLowerCase();
    if (medium === "qr") {
      channel = "qr";
      evidence = "PortPass QR";
    } else if (medium.includes("perk")) {
      channel = "member_perk";
      evidence = "PortPass member perk";
    } else {
      channel = "portpass_link";
      evidence = "PortPass link";
    }
  } else if (isPortpassReferralCode(referralCode)) {
    channel = "referral";
    evidence = "PortPass referral code";
  } else if (attribution.viaPortpass) {
    channel = "portpass_listing";
    evidence = "Found on PortPass";
  } else if (heard === "referral") {
    channel = "referral";
    why = referralCode ? "Referral without a PortPass code" : "Referral, no PortPass code";
  } else if (heard) {
    channel = heard;
    why = `Self-reported ${heardLabel(heard)}, no PortPass link`;
  } else {
    channel = "unknown";
    why = "No source recorded";
  }

  if (!evidence) return { sourceChannel: channel, commissionEligible: false, commissionReason: why };
  if (!isNewFamily) return { sourceChannel: channel, commissionEligible: false, commissionReason: `Returning family (${evidence})` };
  return { sourceChannel: channel, commissionEligible: true, commissionReason: evidence };
}
