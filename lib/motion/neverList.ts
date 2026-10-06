// The places brief 22's motion rules keep still (docs/motion.md, rule 10,
// "Never"): sign-in, the account, the business and admin areas, a child's
// registration or trial, booking and a booking's own page, a wedding plan,
// a payment, the demo business, the shop and the pass. Brief 25 adds
// applying to sell (/sell). The Ferry Route
// (app/_components/motion/RouteProgress.tsx) never shows for a move into
// one of them. A new flow of this kind belongs here.
const QUIET_PREFIXES = [
  "/admin",
  "/account",
  "/login",
  "/signup",
  "/organizations",
  "/claim",
  "/futprep/staff",
  "/futprep/register",
  "/futprep/trial",
  "/futprep/my",
  "/weddings/staff",
  "/weddings/admin",
  "/booking",
  "/demo",
  "/pay",
  "/pass",
  "/shop",
  // PortPass Market (brief 25): applying to sell.
  "/sell",
  "/api",
];

// A step of a flow, wherever it sits: /<section>/<business>/book,
// /<section>/<business>/register, /weddings/<business>/plan.
const QUIET_SEGMENTS = new Set(["book", "register", "plan"]);

export function isQuietPath(pathname: string): boolean {
  if (pathname.startsWith("/business/")) return true;
  if (pathname.split("/").some((segment) => QUIET_SEGMENTS.has(segment))) return true;
  return QUIET_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
