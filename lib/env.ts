// The settings the server needs, by NAME, and which of them are missing.
// Nothing in this file reads a value out to anyone: the names are the whole
// report (CLAUDE.md, rule 6). The table of every setting, who sets it and
// how often it is changed is docs/security/env-vars.md.
//
// "Required" means a production copy of the site is not whole without it:
// a page, an email or a job fails closed until it is set. Admin -> Settings
// (lib/adminHealth.ts) shows the same facts as switches a founder can read;
// this list is what the server itself checks when it starts
// (instrumentation.ts), so a missing setting is in the host's log before
// anyone presses anything.

export type EnvRequirement = { name: string; purpose: string };

export const REQUIRED_ENV: readonly EnvRequirement[] = [
  { name: "SUPABASE_URL", purpose: "Where the database is." },
  { name: "SUPABASE_SECRET_KEY", purpose: "The server's key to the database. Every read and write goes through it." },
  { name: "SUPABASE_PUBLISHABLE_KEY", purpose: "Supabase Auth: sign-in codes and Google." },
  { name: "PLATFORM_OWNER_EMAILS", purpose: "Whose first sign-in makes them a platform owner." },
  { name: "RESEND_API_KEY", purpose: "Sending email." },
  { name: "PORTPASS_FROM_EMAIL", purpose: "The PortPass sender address." },
  { name: "FUTPREP_FROM_EMAIL", purpose: "Futprep's sender address, for parents' emails." },
  { name: "CRON_SECRET", purpose: "Lets Vercel Cron, and nobody else, start the scheduled jobs." },
  { name: "RESEND_WEBHOOK_SECRET", purpose: "Checks the signature on Resend's delivery reports." },
  { name: "BACKUP_HEARTBEAT_SECRET", purpose: "Lets the backup machine, and nobody else, report a backup." },
];

export type Env = Record<string, string | undefined>;

// Blank counts as not set.
export function isSet(name: string, env: Env = process.env): boolean {
  return Boolean(env[name]?.trim());
}

export function missingEnv(env: Env = process.env, required: readonly EnvRequirement[] = REQUIRED_ENV): string[] {
  return required.map((r) => r.name).filter((name) => !isSet(name, env));
}

type Logger = Pick<Console, "error" | "warn" | "info">;

// Run once when the server starts. Writes one line: either that every
// required setting is set, or the names of those that are not. In
// production that line is an error; anywhere else (local, CI, a preview) a
// warning, since a local stack sets only what it tests.
export function checkEnvAtStartup(env: Env = process.env, log: Logger = console): string[] {
  const missing = missingEnv(env);
  if (missing.length === 0) {
    log.info(`env: all ${REQUIRED_ENV.length} required settings are set`);
    return missing;
  }
  const line = `env: ${missing.length} required setting${missing.length === 1 ? " is" : "s are"} not set: ${missing.join(", ")}`;
  if (env.VERCEL_ENV === "production") log.error(line);
  else log.warn(line);
  return missing;
}

// A protected endpoint whose secret is not set refuses the call (503) and
// says so in the log, by the setting's name. Nothing from the request is
// written: a caller's token is a value too.
export function logRefusedUnset(name: string, route: string, log: Pick<Console, "error"> = console): void {
  log.error(`${route}: ${name} is not set, so the call was refused (503)`);
}
