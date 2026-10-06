import { logRefusedUnset } from "./env";
import { bearerToken, secretsMatch } from "./sharedSecret";

// Who may run a scheduled job (app/api/cron/*). Vercel Cron calls each
// route on its schedule and, because CRON_SECRET is set on the project,
// sends it as "Authorization: Bearer <CRON_SECRET>" (that is Vercel's own
// behaviour for the variable of that name; vercel.json holds only the
// schedule).
//
// The routes fail closed everywhere: without CRON_SECRET set, every call is
// refused with 503 and the log says the setting's name, so a job that
// sends email or writes fees cannot be started by a stranger, and a copy of
// the site that has not been set up does not quietly run jobs. With it set,
// every call that does not carry it is refused with 401. There is no
// "outside production the routes run" any more (Brief 21, part A): a local
// stack or CI sets its own CRON_SECRET to test a job.

export type CronGate = { ok: true } | { ok: false; status: 503 | 401; error: string };

export function cronGate(request: Request, env: Record<string, string | undefined> = process.env): CronGate {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    logRefusedUnset("CRON_SECRET", new URL(request.url).pathname);
    return { ok: false, status: 503, error: "Not set up." };
  }
  if (!secretsMatch(bearerToken(request), secret)) return { ok: false, status: 401, error: "Not allowed." };
  return { ok: true };
}
