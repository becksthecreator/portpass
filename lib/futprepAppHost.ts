// register.futprep.com (19 Nov 2026, HQ's plan "Futprep × PortPass: How
// the Site Connects to the App"): futprep.com stays on Squarespace, and its
// Register and Book buttons come here, to PortPass's Futprep registration
// on Futprep's own subdomain. On portpassbahamas.com those pages redirect
// to futprep.com (lib/futprepOffSite.ts), so families register only here.
//
// This is not a custom_domain (organizations.custom_domain stays empty):
// that would open Futprep's mini-site under /sites, not registration.
// middleware.ts asks futprepAppRoute() what to do with each request on
// this host. Prices, classes and the opening date (7 Dec) all come from
// the database, as on any host.

export const FUTPREP_APP_HOST = "register.futprep.com";
const FUTPREP_SITE = "https://www.futprep.com/";
const PLATFORM_ORIGIN = "https://portpassbahamas.com";

// What families use here: registration, the free taster, private-session
// booking, camps, their status lookup and class updates, plus PortPass's
// sign-in and account pages (a signed-in parent books the taster) and the
// payment and booking request pages a parent is sent to.
const SERVED = [
  "/futprep/register",
  "/futprep/trial",
  "/futprep/book",
  "/futprep/camps",
  "/futprep/my",
  "/futprep/feed",
  "/login",
  "/signup",
  "/account",
  "/pay",
  "/booking",
  "/privacy",
  "/terms",
  "/api",
  "/icons",
  "/apple-icon",
];

export type AppRoute = { kind: "pass" } | { kind: "redirect"; to: string };

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isFutprepAppHost(host: string | null | undefined): boolean {
  return (host ?? "").toLowerCase().replace(/:\d+$/, "") === FUTPREP_APP_HOST;
}

export function futprepAppRoute(pathname: string, search = ""): AppRoute {
  if (pathname === "/" || pathname === "") return { kind: "redirect", to: `/futprep/register${search}` };
  if (SERVED.some((prefix) => under(pathname, prefix))) return { kind: "pass" };
  // Coaches and the desk sign in on PortPass, as before (rule 9): their
  // PIN cookie belongs to portpassbahamas.com.
  if (under(pathname, "/futprep/staff") || under(pathname, "/business")) return { kind: "redirect", to: `${PLATFORM_ORIGIN}${pathname}${search}` };
  return { kind: "redirect", to: FUTPREP_SITE };
}
