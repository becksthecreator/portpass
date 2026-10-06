import { logRefusedUnset } from "./env";
import { bearerToken, secretsMatch } from "./sharedSecret";

// Who may run a scheduled job (app/api/cron/*). Vercel Cron calls each
// route on its schedule and, because CRON_SECRET is set on the project,
// sends it as "Authorization: Bearer <CRON_SECRET>" (that is Vercel's own
// behaviour for the variable of that name; vercel.json holds only the
// schedule).
//
// The routes fail closed everywhere: without CRON_SECRET set, every call is
// refused with 503, the log says the setting's name, and the founders are
// told once an hour (db/alerts.ts, Brief 21 part G), so a job that sends
// email or writes fees cannot be started by a stranger, and a copy of the
// site that has not been set up does not quietly run jobs. With it set,
// every call that does not carry it is refused with 401. There is no
// "outside production the routes run" any more (Brief 21, part A): a local
// stack or CI sets its own CRON_SECRET to test a job.

export type CronGate = { ok: true } | { ok: false; status: 503 | 401; error: string };

// What to do when the secret is unset, besides refusing: by default the
// alert. Passed in so the unit test can watch it without a database.
export type UnsetNotice = (path: string) => void;

async function defaultUnsetNotice(path: string): Promise<void> {
  const { alertCronUnset } = await import("@/db/alerts");
  await alertCronUnset(path);
}

export function cronGate(request: Request, env: Record<string, string | undefined> = process.env, notice: UnsetNotice = (path) => void defaultUnsetNotice(path).catch(() => {})): CronGate {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    const path = new URL(request.url).pathname;
    logRefusedUnset("CRON_SECRET", path);
    try {
      notice(path);
    } catch {
      // Telling the founders must never change the answer.
    }
    return { ok: false, status: 503, error: "Not set up." };
  }
  if (!secretsMatch(bearerToken(request), secret)) return { ok: false, status: 401, error: "Not allowed." };
  return { ok: true };
}
