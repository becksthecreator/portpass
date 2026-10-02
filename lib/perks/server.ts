import "server-only";
import { revalidateTag } from "next/cache";
import { MEMBER_PERKS_TAG } from "@/db/memberPerks";
import { bumpListings } from "@/lib/revalidate";

// A perk that is published or ended changes cards, pages, /perks and the
// homepage row: drop the cached list and the pages built from it.
export function bumpPerks(): void {
  try {
    revalidateTag(MEMBER_PERKS_TAG, { expire: 0 });
  } catch {
    // Not inside a Next request (tests, scripts): nothing to invalidate.
  }
  bumpListings();
}

export const PERK_REFUSALS: Record<string, { status: number; error: string }> = {
  NOT_FOUND: { status: 404, error: "Not found." },
  BAD_OFFERING: { status: 400, error: "Choose one of your own offerings, or all of them." },
  NOT_DRAFT: { status: 409, error: "A perk that has been published can't be changed: members may already be counting on it. End it and publish a new one." },
  ALREADY_ENDED: { status: 409, error: "This perk has already ended." },
  NOT_A_MEMBER: { status: 404, error: "Not valid." },
  ALREADY_USED: { status: 409, error: "This member has already used this perk: it is for a first booking only." },
  MONTH_FULL: { status: 409, error: "This month's limit for this perk has been reached." },
  NOT_LIVE: { status: 409, error: "This perk isn't running today." },
  BELOW_MINIMUM: { status: 409, error: "The price is below this perk's minimum spend." },
};

export function perkRefusal(error: unknown): { status: number; error: string } | null {
  return PERK_REFUSALS[error instanceof Error ? error.message : ""] ?? null;
}
