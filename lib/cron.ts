// Who may run a scheduled job (app/api/cron/*). Vercel Cron calls each
// route on its schedule and, when the CRON_SECRET environment variable is
// set on the project, sends it as a bearer token; anything else is then
// refused.
//
// Until that variable is set the routes still run, because each job is
// safe to call by anyone at any time: it acts only inside its own window
// (Saturday morning, the 1st of the month), it claims its period in the
// job_runs table before sending anything, and so a second call, by Vercel
// or by a stranger, does nothing. Setting CRON_SECRET closes the door
// properly; the code never needs changing.
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
