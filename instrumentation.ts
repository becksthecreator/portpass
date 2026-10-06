import type { Instrumentation } from "next";

// Runs once when a server instance starts. Writes one line saying which
// required settings are missing, by name (lib/env.ts; Brief 21, part A).
// Only the Node.js runtime: the edge middleware has its own, smaller needs.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnvAtStartup } = await import("@/lib/env");
  checkEnvAtStartup();
}

// A soft brake: a broken page hit by a crowd must not become thousands of
// rows. Per server instance, which is enough to keep the count honest.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
let windowStart = 0;
let written = 0;

// Every server-side failure is counted for Admin -> Overview -> Health
// (brief 08, 1.1: "site errors in the last 24 hours"). Only the route's
// pattern, the kind of error and its digest are kept: never the address
// (it can hold a reference code or a token) and never the message (it can
// quote what someone typed). The full error is in the host's logs, found
// by the digest.
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    written = 0;
  }
  if (written >= MAX_PER_WINDOW) return;
  written += 1;
  try {
    const failure = error as { name?: unknown; digest?: unknown } | null;
    const { recordSiteError } = await import("@/db/adminHealth");
    await recordSiteError({
      route: context.routePath,
      routeType: context.routeType,
      errorName: typeof failure?.name === "string" ? failure.name : "Error",
      digest: typeof failure?.digest === "string" ? failure.digest : null,
    });
    // Twenty in ten minutes is a spike: the founders are told once an hour (Brief 21, part G).
    const { checkSiteErrorSpike } = await import("@/db/alerts");
    await checkSiteErrorSpike();
  } catch {
    // Counting an error must never cause another one.
  }
};
