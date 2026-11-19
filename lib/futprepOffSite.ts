// Futprep off PortPass's public pages (19 Nov 2026, Antonio): its card
// stays in Sports & Fitness, and every public Futprep page sends families
// to Futprep's own site. next.config.ts redirects these paths (on
// portpassbahamas.com only); app/sitemap.ts leaves them out.
//
// Not here, so they keep working: /futprep/staff (PIN logins, rule 9),
// /futprep/my (families' status lookup), /business/futprep (the owner
// dashboard) and every /api route.

export const FUTPREP_SITE = "https://www.futprep.com/";

export const FUTPREP_PUBLIC_PATHS = [
  "/sports-fitness/futprep-athletics",
  "/sports-fitness/futprep-athletics/:path*",
  "/futprep",
  "/futprep/register",
  "/futprep/register/:path*",
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
