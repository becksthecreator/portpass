// Pure helpers for prices (no server imports): shared by /pricing, the
// admin Prices screen and the tests.
export type PlanKind = "subscription" | "commission" | "per_event" | "custom";

export type PricingPlan = {
  code: string;
  name: string;
  kind: PlanKind;
  monthlyCents: number;
  annualMonthsCharged: number;
  commissionBps: number;
  blurb: string | null;
  features: string[];
  badge: string | null;
  isPublic: boolean;
  sort: number;
  active: boolean;
};

export type PricingAddon = {
  code: string;
  name: string;
  amountCents: number;
  unit: "one_time" | "month" | "week" | "item";
  note: string | null;
  group: "addon" | "promote";
  isPublic: boolean;
  status: "adopted" | "proposed";
  sort: number;
};

// Annual = monthly x months charged (10 by default: two months free).
export function annualCents(plan: Pick<PricingPlan, "monthlyCents" | "annualMonthsCharged">): number {
  return plan.monthlyCents * plan.annualMonthsCharged;
}

export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100)}`;
}

export function percentFromBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

export const UNIT_LABEL: Record<PricingAddon["unit"], string> = {
  one_time: "one-time",
  month: "per month",
  week: "per week",
  item: "each",
};

// The features a plan adds over the plan before it (plans are cumulative),
// for the "Everything in Solo, plus …" card copy.
export function addedFeatures(plan: PricingPlan, previous: PricingPlan | null): string[] {
  if (!previous) return plan.features;
  const before = new Set(previous.features);
  return plan.features.filter((f) => !before.has(f));
}
