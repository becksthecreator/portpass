import { revalidatePath, revalidateTag } from "next/cache";

// The cached list of live member perks (db/memberPerks.ts): a business
// changed or an offering removed (which ends its perks) drops it too.
export const MEMBER_PERKS_TAG = "member-perks";

// Public pages are ISR (speed brief, 29 Sept, 1.2): the homepage, section
// and subsection pages, business listings and their offering pages are
// cached for five minutes and rebuilt on the next request. Any write that
// changes what those pages show calls this, so an admin or owner edit is
// live on the next request rather than up to five minutes later.
//
// One call invalidates the whole public tree (the layout). At three
// businesses that is cheaper than tracking which of a dozen paths a given
// edit touched, and it can never miss one. It is a no-op outside a request
// (integration tests call the same db functions), so it never throws.
export function bumpListings(): void {
  try {
    revalidatePath("/", "layout");
    revalidateTag(MEMBER_PERKS_TAG, { expire: 0 });
  } catch {
    // Not inside a Next request (tests, scripts): nothing to invalidate.
  }
}
