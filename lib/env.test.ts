import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REQUIRED_ENV, checkEnvAtStartup, isSet, logRefusedUnset, missingEnv } from "./env";

const allSet = Object.fromEntries(REQUIRED_ENV.map((r) => [r.name, `${r.name.toLowerCase()}-value-not-real`]));

describe("the startup env check", () => {
  it("names what is missing, and blank counts as missing", () => {
    expect(missingEnv(allSet)).toEqual([]);
    expect(missingEnv({ ...allSet, CRON_SECRET: "  ", RESEND_WEBHOOK_SECRET: undefined })).toEqual(["CRON_SECRET", "RESEND_WEBHOOK_SECRET"]);
    expect(isSet("CRON_SECRET", { CRON_SECRET: " " })).toBe(false);
    expect(isSet("CRON_SECRET", { CRON_SECRET: "x" })).toBe(true);
  });

  it("logs the names of missing settings, never a value", () => {
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const env = { ...allSet, VERCEL_ENV: "production", BACKUP_HEARTBEAT_SECRET: "" };
    expect(checkEnvAtStartup(env, log)).toEqual(["BACKUP_HEARTBEAT_SECRET"]);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
    const line = String(log.error.mock.calls[0][0]);
    expect(line).toBe("env: 1 required setting is not set: BACKUP_HEARTBEAT_SECRET");
    for (const value of Object.values(allSet)) expect(line).not.toContain(value);
  });

  it("is a warning outside production and one quiet line when everything is set", () => {
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    expect(checkEnvAtStartup({ VERCEL_ENV: "preview", SUPABASE_URL: "http://127.0.0.1:54321" }, log).length).toBe(REQUIRED_ENV.length - 1);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(String(log.warn.mock.calls[0][0])).toMatch(/^env: 9 required settings are not set: /);
    expect(log.error).not.toHaveBeenCalled();

    const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    expect(checkEnvAtStartup(allSet, quiet)).toEqual([]);
    expect(quiet.info).toHaveBeenCalledWith(`env: all ${REQUIRED_ENV.length} required settings are set`);
    expect(quiet.warn).not.toHaveBeenCalled();
    expect(quiet.error).not.toHaveBeenCalled();
  });

  it("says which setting a refused endpoint is missing, by name", () => {
    const log = { error: vi.fn() };
    logRefusedUnset("RESEND_WEBHOOK_SECRET", "/api/webhooks/resend", log);
    expect(log.error).toHaveBeenCalledWith("/api/webhooks/resend: RESEND_WEBHOOK_SECRET is not set, so the call was refused (503)");
  });
});

// docs/security/env-vars.md is the table the founders and an auditor read.
// It stays true because this test fails when the code reads a setting the
// table does not name, or the table names one the code no longer reads.
const SERVER_ROOTS = ["app", "lib", "db"];
const SERVER_FILES = ["middleware.ts", "next.config.ts", "instrumentation.ts"];
// Set by the host or the runtime, not by a person; read by the code all the same.
const PLATFORM = new Set(["NODE_ENV", "NEXT_RUNTIME", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA"]);

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|integration\.test)\.tsx?$/.test(name) ? [full] : [];
  });
}

function namesReadByTheServer(): Set<string> {
  const names = new Set<string>();
  const files = [...SERVER_ROOTS.flatMap((root) => walk(join(process.cwd(), root))), ...SERVER_FILES.map((f) => join(process.cwd(), f))];
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) names.add(match[1]);
  }
  // lib/env.ts and lib/cron.ts read theirs through a passed-in env, by the
  // names in REQUIRED_ENV, so a test can hand them a fake one.
  for (const { name } of REQUIRED_ENV) names.add(name);
  return names;
}

function namesInTheTable(): Set<string> {
  const doc = readFileSync(join(process.cwd(), "docs/security/env-vars.md"), "utf8");
  return new Set(Array.from(doc.matchAll(/^\| `([A-Z][A-Z0-9_]+)`/gm), (m) => m[1]));
}

describe("docs/security/env-vars.md", () => {
  const read = namesReadByTheServer();
  const table = namesInTheTable();

  it("names every setting the server reads", () => {
    const missing = [...read].filter((name) => !table.has(name)).sort();
    expect(missing, `read by the code but not in docs/security/env-vars.md: ${missing.join(", ")}`).toEqual([]);
  });

  it("names every required setting, and the three protected endpoints still read their secrets", () => {
    for (const { name } of REQUIRED_ENV) expect(table.has(name), name).toBe(true);
    const route = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    expect(route("app/api/cron/daily/route.ts")).toMatch(/cronGate\(request\)/);
    expect(route("app/api/cron/attendance-nudge/route.ts")).toMatch(/cronGate\(request\)/);
    expect(route("app/api/webhooks/resend/route.ts")).toContain("process.env.RESEND_WEBHOOK_SECRET");
    expect(route("app/api/heartbeat/backup/route.ts")).toContain("process.env.BACKUP_HEARTBEAT_SECRET");
  });

  it("does not name a setting nothing reads", () => {
    const stale = [...table].filter((name) => !read.has(name) && !PLATFORM.has(name)).sort();
    expect(stale, `in docs/security/env-vars.md but read nowhere in app, lib or db: ${stale.join(", ")}`).toEqual([]);
  });

  it("and .env.example name the same settings a person sets", () => {
    const example = new Set(Array.from(readFileSync(join(process.cwd(), ".env.example"), "utf8").matchAll(/^([A-Z][A-Z0-9_]+)=/gm), (m) => m[1]));
    for (const { name } of REQUIRED_ENV) expect(example.has(name), `${name} is required but not in .env.example`).toBe(true);
    const unknown = [...example].filter((name) => !table.has(name)).sort();
    expect(unknown, `in .env.example but not in docs/security/env-vars.md: ${unknown.join(", ")}`).toEqual([]);
  });
});
