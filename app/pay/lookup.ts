import "server-only";
import { headers } from "next/headers";
import { createRateLimiter } from "@/lib/auth/rateLimit";

// Lookups of /pay/<token> pages are rate-limited per visitor: a token is 40
// random hex characters, so guessing one is hopeless, and this keeps anyone
// from trying at speed.
const limited = createRateLimiter(60, 60_000);

export async function lookupAllowed(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return !limited(`pay|${ip}`);
}

// Never let the token travel in a Referer to the business's WhatsApp,
// website or anywhere else a customer taps through to.
export const PAY_PAGE_METADATA = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer" as const,
};
