// Member perks (brief 10): what a business offers people who have a
// PortPass account. The rules only, with no database in them, shared by
// the listing pages, the business's perk screen, the pass check, Admin and
// the tests.
//
// Two things shape every line here. The business funds its own perk and
// applies it when it takes payment: PortPass never holds customer money
// and never changes what a customer is charged. And a price shown must be
// real (Consumer Protection Act 2023): both prices are shown, "$300 ·
// Members $270", never an invented "was" price.

export const PERK_KINDS = ["percent_off", "amount_off", "free_addon", "early_access", "priority"] as const;
export type PerkKind = (typeof PERK_KINDS)[number];

export const PERK_KIND_LABEL: Record<PerkKind, string> = {
  percent_off: "A percentage off",
  amount_off: "An amount off",
  free_addon: "A free extra",
  early_access: "Early access",
  priority: "Priority",
};

// What to suggest first: the two that cost a business least.
export const PERK_KIND_HINT: Record<PerkKind, string> = {
  free_addon: "For example a free extra 30 minutes, or free prints. Usually spare capacity, and it feels generous.",
  early_access: "Members book before everyone else. It costs you nothing.",
  priority: "For example first pick of Saturday slots. It costs you nothing.",
  percent_off: "For example 10% off the first booking.",
  amount_off: "For example $10 off a two-hour booking.",
};

export const PERK_STATUSES = ["draft", "live", "ended"] as const;
export type PerkStatus = (typeof PERK_STATUSES)[number];

export type MemberPerk = {
  id: number;
  organizationId: number;
  // null: the perk is for everything the business offers.
  offeringId: number | null;
  title: string;
  kind: PerkKind;
  percent: number | null;
  amountCents: number | null;
  addonText: string | null;
  earlyAccessHours: number | null;
  firstBookingOnly: boolean;
  minSpendCents: number | null;
  startsOn: string | null;
  endsOn: string | null;
  monthlyCap: number | null;
  conditionsText: string | null;
  status: PerkStatus;
  createdAt: string;
};

export type PerkInput = Omit<MemberPerk, "id" | "organizationId" | "status" | "createdAt">;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// "31 Dec 2026".
export function shortDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month - 1] ?? ""} ${year}`;
}

export function dollars(cents: number): string {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100)}`;
}

// What a form sends, checked. Each kind needs its own number or words, and
// nothing else's.
export function cleanPerk(input: unknown): { ok: true; value: PerkInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
  const raw = input as Record<string, unknown>;
  const clip = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const whole = (value: unknown, min: number, max: number): number | null | undefined => (value === null || value === undefined || value === "" ? null : typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined);
  const day = (value: unknown): string | null | undefined => (value === null || value === undefined || value === "" ? null : isDay(value) ? value : undefined);

  const kind = PERK_KINDS.find((k) => k === raw.kind);
  if (!kind) return { ok: false, error: "Choose the kind of perk." };
  const title = clip(raw.title, 80);
  if (title.length < 4) return { ok: false, error: "Give the perk a short title, like \"10% off your first booking\"." };

  const percent = whole(raw.percent, 1, 100);
  const amountCents = whole(raw.amountCents, 1, 10_000_000);
  const earlyAccessHours = whole(raw.earlyAccessHours, 1, 24 * 30);
  const minSpendCents = whole(raw.minSpendCents, 1, 10_000_000);
  const monthlyCap = whole(raw.monthlyCap, 1, 100_000);
  const offeringId = whole(raw.offeringId, 1, Number.MAX_SAFE_INTEGER);
  const startsOn = day(raw.startsOn);
  const endsOn = day(raw.endsOn);
  if ([percent, amountCents, earlyAccessHours, minSpendCents, monthlyCap, offeringId].includes(undefined)) return { ok: false, error: "One of the numbers isn't valid." };
  if (startsOn === undefined || endsOn === undefined) return { ok: false, error: "One of the dates isn't a real date." };
  if (startsOn && endsOn && endsOn < startsOn) return { ok: false, error: "The perk ends before it starts." };
  const addonText = clip(raw.addonText, 120) || null;

  if (kind === "percent_off" && !percent) return { ok: false, error: "Say what percentage members get off." };
  if (kind === "amount_off" && !amountCents) return { ok: false, error: "Say how much members get off, in dollars." };
  if (kind === "free_addon" && !addonText) return { ok: false, error: "Say what members get free." };
  if (kind === "early_access" && !earlyAccessHours) return { ok: false, error: "Say how many hours early members can book." };

  return {
    ok: true,
    value: {
      offeringId: offeringId ?? null, title, kind,
      percent: kind === "percent_off" ? percent ?? null : null,
      amountCents: kind === "amount_off" ? amountCents ?? null : null,
      addonText: kind === "free_addon" ? addonText : null,
      earlyAccessHours: kind === "early_access" ? earlyAccessHours ?? null : null,
      firstBookingOnly: raw.firstBookingOnly === true, minSpendCents: minSpendCents ?? null, startsOn, endsOn, monthlyCap: monthlyCap ?? null, conditionsText: clip(raw.conditionsText, 200) || null,
    },
  };
}

// Showing today: published, started, and not past its last day.
export function isPerkLive(perk: Pick<MemberPerk, "status" | "startsOn" | "endsOn">, today: string): boolean {
  return perk.status === "live" && (!perk.startsOn || perk.startsOn <= today) && (!perk.endsOn || today <= perk.endsOn);
}

// The gold chip on a card: "Members: 10% off first booking".
export function perkChip(perk: Pick<MemberPerk, "kind" | "percent" | "amountCents" | "addonText" | "earlyAccessHours" | "firstBookingOnly" | "title">): string {
  const first = perk.firstBookingOnly ? " first booking" : "";
  if (perk.kind === "percent_off" && perk.percent) return `Members: ${perk.percent}% off${first}`;
  if (perk.kind === "amount_off" && perk.amountCents) return `Members: ${dollars(perk.amountCents)} off${first}`;
  if (perk.kind === "free_addon" && perk.addonText) return `Members: free ${perk.addonText.replace(/^free\s+/i, "")}`;
  if (perk.kind === "early_access" && perk.earlyAccessHours) return `Members: book ${perk.earlyAccessHours >= 48 && perk.earlyAccessHours % 24 === 0 ? `${perk.earlyAccessHours / 24} days` : `${perk.earlyAccessHours} hours`} early`;
  return `Members: ${perk.title}`;
}

// The conditions under a perk, in plain words: "First booking only. Ends 31 Dec 2026."
export function perkConditions(perk: Pick<MemberPerk, "firstBookingOnly" | "minSpendCents" | "endsOn" | "monthlyCap" | "conditionsText">): string {
  const parts: string[] = [];
  if (perk.firstBookingOnly) parts.push("First booking only.");
  if (perk.minSpendCents) parts.push(`When you spend ${dollars(perk.minSpendCents)} or more.`);
  if (perk.monthlyCap) parts.push(`Limited to ${perk.monthlyCap} a month.`);
  if (perk.endsOn) parts.push(`Ends ${shortDay(perk.endsOn)}.`);
  if (perk.conditionsText) parts.push(perk.conditionsText.endsWith(".") ? perk.conditionsText : `${perk.conditionsText}.`);
  return parts.join(" ");
}

// Prices that are per hour, per person, per child or per day: an amount off
// comes off the booking, not off each unit, so no member unit price is
// shown for them (it wouldn't be real).
const PER_UNIT = new Set(["per_hour", "per_person", "per_child", "per_day"]);

// The member's price for something with a real price, or null when the
// perk doesn't change a price (a free extra, early access, priority), the
// price is below the perk's minimum spend, or an amount off can't be shown
// on a unit price. Never below zero.
export function memberPriceCents(priceCents: number, perk: Pick<MemberPerk, "kind" | "percent" | "amountCents" | "minSpendCents">, priceUnit: string | null = null): number | null {
  if (perk.minSpendCents && priceCents < perk.minSpendCents) return null;
  if (perk.kind === "percent_off" && perk.percent) return Math.max(0, priceCents - Math.round((priceCents * perk.percent) / 100));
  if (perk.kind === "amount_off" && perk.amountCents && !(priceUnit && PER_UNIT.has(priceUnit))) return Math.max(0, priceCents - perk.amountCents);
  return null;
}

// "$300 · Members $270": both prices, both real.
export function bothPrices(priceCents: number, perk: Pick<MemberPerk, "kind" | "percent" | "amountCents" | "minSpendCents">, priceUnit: string | null = null): string | null {
  const member = memberPriceCents(priceCents, perk, priceUnit);
  return member === null || member === priceCents ? null : `${dollars(priceCents)} · Members ${dollars(member)}`;
}

// Whether this member can have this perk now, and if not, why.
export type Eligibility = { eligible: true } | { eligible: false; reason: "not_live" | "already_used" | "month_full" };

export function eligibility(perk: Pick<MemberPerk, "status" | "startsOn" | "endsOn" | "firstBookingOnly" | "monthlyCap">, today: string, used: { byThisMember: number; thisMonth: number }): Eligibility {
  if (!isPerkLive(perk, today)) return { eligible: false, reason: "not_live" };
  if (perk.firstBookingOnly && used.byThisMember > 0) return { eligible: false, reason: "already_used" };
  if (perk.monthlyCap && used.thisMonth >= perk.monthlyCap) return { eligible: false, reason: "month_full" };
  return { eligible: true };
}

export const ELIGIBILITY_REASON: Record<"not_live" | "already_used" | "month_full", string> = {
  not_live: "This perk isn't running today.",
  already_used: "Already used: it is for a first booking only.",
  month_full: "This month's limit for this perk has been reached.",
};

// The homepage row and its section rows appear only once there is
// something to show for them.
export const PERKS_ROW_MINIMUM = 3;

// ---- Member numbers -------------------------------------------------------------------

// No 0/O, 1/I/L: a number read out at a counter must be unambiguous.
export const MEMBER_NUMBER_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function isMemberNumber(value: unknown): value is string {
  return typeof value === "string" && /^PP-[2-9A-HJKMNP-Z]{4,6}$/.test(value);
}

// What staff type at the counter, however they type it: "pp 7k3q" -> "PP-7K3Q".
export function normalizeMemberNumber(typed: string): string | null {
  const letters = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // With or without the "PP" in front (a number can itself begin with PP).
  for (const body of [letters.replace(/^PP/, ""), letters]) {
    if (isMemberNumber(`PP-${body}`)) return `PP-${body}`;
  }
  return null;
}

// ---- Early access ---------------------------------------------------------------------

// The members-only window: from `hours` before the public opening until
// the public opening itself. Closed before it, and no longer "members
// only" after it.
export function memberEarlyAccessOpen(publicOpensAt: string | null, hours: number | null, now: Date = new Date()): boolean {
  if (!publicOpensAt || !hours || hours <= 0) return false;
  const opens = new Date(publicOpensAt).getTime();
  if (Number.isNaN(opens)) return false;
  const t = now.getTime();
  return t < opens && t >= opens - hours * 60 * 60 * 1000;
}

// ---- Where a sign-up came from --------------------------------------------------------

export const SIGNUP_SOURCE_LABEL: Record<string, string> = {
  perk: "A member perk",
  own: "OWN Conference",
  counter_qr: "A counter sign",
  instagram: "Instagram",
  pass: "The Member Pass page",
  other: "Another tagged link",
};

// The utm_source on a sign-up link, kept as one of a short list of tags.
// Any other value is kept as "other": a link can't put an identifier of
// its own on an account. Nothing at all when there is no tag.
export function cleanSignupSource(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const tag = value.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SIGNUP_SOURCE_LABEL, tag) ? tag : "other";
}

// The name a business sees: the first word of the member's name, never
// anything that looks like an email address or a username (an account
// made before names were asked for can hold its email's first half).
export function memberFirstName(fullName: unknown, nameFromEmail = false): string {
  if (nameFromEmail) return "Member";
  const first = typeof fullName === "string" ? fullName.trim().split(/\s+/)[0] ?? "" : "";
  if (!first || /[@._\d]/.test(first) || first.length > 30) return "Member";
  return first;
}

export function signupSourceLabel(tag: string | null): string {
  return tag ? SIGNUP_SOURCE_LABEL[tag] ?? tag : "No source recorded";
}

// The sign-up link behind "Sign up free to unlock": back to the same page afterwards.
export function unlockHref(path: string): string {
  return `/signup?as=customer&next=${encodeURIComponent(path)}&utm_source=perk`;
}
