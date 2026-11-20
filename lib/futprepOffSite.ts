// Futprep off PortPass's public pages (19 Nov 2026, Antonio): its card
// stays in Sports & Fitness, and every public Futprep page sends families
// to Futprep's own site. next.config.ts redirects these paths (on
// portpassbahamas.com only); app/sitemap.ts leaves them out.
//
// Not here, so they keep working: /futprep/staff (PIN logins, rule 9),
// /futprep/my (families' status lookup), /futprep/register/return/<token>
// (a returning family's own link), /business/futprep (the owner dashboard)
// and the APIs. Of those, the two public forms' APIs answer only as
// publicFutprepWriteAllowed() says.

export const FUTPREP_SITE = "https://www.futprep.com/";

// Futprep's own registration address (#262 serves it). Until its DNS
// record exists no request carries it, so the forms stay closed.
export const FUTPREP_REGISTRATION_HOST = "register.futprep.com";

export const FUTPREP_PUBLIC_PATHS = [
  "/sports-fitness/futprep-athletics",
  "/sports-fitness/futprep-athletics/:path*",
  "/futprep",
  "/futprep/register",
  "/futprep/trial",
  "/futprep/camps",
  "/futprep/book",
  "/futprep/coaches",
  "/futprep/programs",
  "/futprep/lil-kickers",
  "/futprep/lil-kickers/register",
  "/futprep/kickers",
  "/futprep/messy-tots",
  "/futprep/ig",
] as const;

// The public registration and private-session forms take a new request
// only on Futprep's own registration address. A returning family's link
// (it carries a returnToken, checked by the registration route as before)
// still finishes on portpassbahamas.com.
//
// A local stack (localhost, or a test's request with no host) stays open,
// so Futprep's integration tests and the end-to-end runs still register
// TEST families (rule 9). Production and previews always send a host.
export function publicFutprepWriteAllowed(host: string | null | undefined, options: { returnToken?: unknown } = {}): boolean {
  const name = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  if (name === FUTPREP_REGISTRATION_HOST || name === "" || name === "localhost" || name === "127.0.0.1") return true;
  return typeof options.returnToken === "string" && options.returnToken.trim().length > 0;
}

export const FUTPREP_CLOSED_MESSAGE = "Futprep registration and bookings are on futprep.com for now.";
