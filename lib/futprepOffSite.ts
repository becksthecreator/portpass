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

// Futprep's own registration address (#262 serves it). It has no DNS
// record yet (23 Nov), so no request carries it.
export const FUTPREP_REGISTRATION_HOST = "register.futprep.com";

// Until register.futprep.com is live, parents register on PortPass's own
// domain (23 Nov 2026, Bex: "parents can't register right now"). While
// this is true, the four form pages below stay on portpassbahamas.com and
// their APIs take new requests there. The rest of #258 is unchanged: the
// info pages still go to futprep.com, and previews and any other host
// still can't take a request. Once register.futprep.com answers, set this
// to false and the forms move there.
export const FUTPREP_FORMS_ON_PORTPASS = true;

const PORTPASS_HOSTS = ["portpassbahamas.com", "www.portpassbahamas.com"];

// The pages that hold a form: registration, the taster, camps and a
// private session.
export const FUTPREP_FORM_PATHS = ["/futprep/register", "/futprep/trial", "/futprep/camps", "/futprep/book"] as const;

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

// What next.config.ts redirects away from portpassbahamas.com. The info
// pages go to futprep.com. The form pages stay here while
// FUTPREP_FORMS_ON_PORTPASS is on; once it is off they go to the same page
// on register.futprep.com, so a link to portpassbahamas.com/futprep/register
// (futprep.com's Register button) keeps working after the switch.
const isFormPath = (path: string) => (FUTPREP_FORM_PATHS as readonly string[]).includes(path);
export const FUTPREP_REDIRECTS: ReadonlyArray<{ source: string; destination: string }> = FUTPREP_PUBLIC_PATHS.filter(
  (path) => !(FUTPREP_FORMS_ON_PORTPASS && isFormPath(path)),
).map((source) => ({ source, destination: isFormPath(source) ? `https://${FUTPREP_REGISTRATION_HOST}${source}` : FUTPREP_SITE }));
export const FUTPREP_REDIRECTED_PATHS: readonly string[] = FUTPREP_REDIRECTS.map((r) => r.source);

// The public registration and private-session forms take a new request
// only on Futprep's own registration address, and on portpassbahamas.com
// while FUTPREP_FORMS_ON_PORTPASS is true. A returning family's link
// (it carries a returnToken, checked by the registration route as before)
// still finishes on portpassbahamas.com.
//
// A local stack (localhost, or a test's request with no host) stays open,
// so Futprep's integration tests and the end-to-end runs still register
// TEST families (rule 9). Production and previews always send a host.
export function publicFutprepWriteAllowed(host: string | null | undefined, options: { returnToken?: unknown } = {}): boolean {
  const name = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  if (name === FUTPREP_REGISTRATION_HOST || name === "" || name === "localhost" || name === "127.0.0.1") return true;
  if (FUTPREP_FORMS_ON_PORTPASS && PORTPASS_HOSTS.includes(name)) return true;
  return typeof options.returnToken === "string" && options.returnToken.trim().length > 0;
}

export const FUTPREP_CLOSED_MESSAGE = "Futprep registration and bookings are on futprep.com for now.";
