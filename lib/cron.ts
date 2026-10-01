// Who may run a scheduled job (app/api/cron/*). Vercel Cron calls each
// route on its schedule and, when the CRON_SECRET environment variable is
// set on the project, sends it as a bearer token.
//
// In production the routes refuse every call until CRON_SECRET is set, and
// then every call that does not carry it: a job that sends email or writes
// fees is not something a stranger should be able to start, even though
// each job also claims its period so it cannot act twice. Outside
// production (local, CI, a preview with no secret) the routes run, so they
// can be tested.
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.VERCEL_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
