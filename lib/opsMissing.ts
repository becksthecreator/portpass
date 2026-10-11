// The "Missing" list on Futprep's operating map (brief 31, B2): what is not
// filled in yet, one line per gap, each linking to the screen that fixes
// it. Pure: the page passes in what it loaded.

import { isCosted } from "./futprepLocations";
import type { LocationCostModel } from "./coachPay";
import { missingForLogin, type LoginState } from "./futprepRoles";

export type MissingKind = "cost" | "login" | "email" | "pin" | "photo" | "days" | "pay_rate";

export type MissingLine = { kind: MissingKind; who: string; text: string; href: string };

export type MissingInput = {
  locations: Array<{ name: string; active: boolean; costModel: LocationCostModel | null; costCents: number | null }>;
  coaches: Array<{
    name: string;
    active: boolean;
    memberType: string;
    photoUrl: string | null;
    workingDays: number[];
    login: LoginState | null;
    leadPayCents: number | null;
  }>;
};

export const FIX_SCREEN: Record<MissingKind, string> = {
  cost: "/futprep/staff/locations",
  login: "/futprep/staff/accounts",
  email: "/futprep/staff/accounts",
  pin: "/futprep/staff/accounts",
  photo: "/futprep/staff/team",
  days: "/futprep/staff/team",
  pay_rate: "/futprep/staff/pay",
};

const LOGIN_KIND: Record<string, MissingKind | undefined> = { "No login": "login", "No email": "email", "No PIN yet": "pin" };

// Places first, then coaches in the order given; within a coach, the login
// before the profile before pay. Switched-off places and hidden coaches
// are left out: nobody needs to fill them in.
export function missingLines(input: MissingInput): MissingLine[] {
  const lines: MissingLine[] = [];
  const add = (kind: MissingKind, who: string, what: string) => lines.push({ kind, who, text: `${who}: ${what}`, href: FIX_SCREEN[kind] });

  for (const location of input.locations) {
    if (location.active && !isCosted(location)) add("cost", location.name, "no cost yet");
  }
  for (const coach of input.coaches) {
    if (!coach.active || coach.memberType !== "coach") continue;
    for (const chip of missingForLogin(coach.login ?? { linked: false, hasEmail: false, hasPin: false, active: false })) {
      const kind = LOGIN_KIND[chip];
      if (kind) add(kind, coach.name, chip === "No login" ? "no staff login" : chip === "No email" ? "no email" : "no PIN yet");
    }
    if (!coach.photoUrl) add("photo", coach.name, "no photo");
    if (coach.workingDays.length === 0) add("days", coach.name, "no working days");
    if (coach.leadPayCents === null) add("pay_rate", coach.name, "no pay rate");
  }
  return lines;
}
