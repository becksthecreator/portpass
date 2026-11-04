#!/usr/bin/env node
// Fetches the live site and fails when a security header is missing or
// wrong (Brief 21, part D). Run by .github/workflows/headers-check.yml
// after each deploy and weekly; by hand:
//
//   node scripts/security/headers-check.mjs            # https://portpassbahamas.com
//   node scripts/security/headers-check.mjs https://... # another copy
//
// Exit code 0 when every page checked carries every header; 1 otherwise.
// Nothing here needs a key, and nothing is written anywhere.
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? process.env.HEADERS_CHECK_URL ?? "https://portpassbahamas.com").replace(/\/$/, "");
// A static page, a dynamic page, a business page and an API answer: the
// headers come from next.config.ts, so every kind of answer must carry them.
const PATHS = ["/", "/pricing", "/sports-fitness/futprep-athletics", "/api/auth/me"];

// name -> what the value must contain (each item), all case-sensitive
// except the header name.
const REQUIRED = {
  "strict-transport-security": ["max-age=63072000", "includeSubDomains", "preload"],
  "x-content-type-options": ["nosniff"],
  "x-frame-options": ["DENY"],
  "referrer-policy": ["strict-origin-when-cross-origin"],
  "permissions-policy": ["camera=()", "microphone=()", "geolocation=()"],
};
// The policy's header is the one lib/securityHeaders.ts's CSP_MODE names
// ("enforce" since brief 26): a rollback to report-only is one line there,
// and this check follows it. The other header must be absent, so a deploy
// still on the old mode is caught.
const MODE = /export const CSP_MODE: CspMode = "(report-only|enforce)";/.exec(readFileSync(new URL("../../lib/securityHeaders.ts", import.meta.url), "utf8"))?.[1] ?? "enforce";
const CSP = MODE === "enforce" ? "content-security-policy" : "content-security-policy-report-only";
const CSP_OTHER = MODE === "enforce" ? "content-security-policy-report-only" : "content-security-policy";
const CSP_MUST_CONTAIN = ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"];

async function check(path) {
  const url = `${base}${path}`;
  const problems = [];
  let response;
  try {
    response = await fetch(url, { redirect: "manual", headers: { "user-agent": "portpass-headers-check" } });
  } catch (error) {
    return [`${path}: could not be fetched (${error instanceof Error ? error.message : String(error)})`];
  }
  for (const [name, needles] of Object.entries(REQUIRED)) {
    const value = response.headers.get(name);
    if (value === null) {
      problems.push(`${path}: ${name} is missing`);
      continue;
    }
    for (const needle of needles) if (!value.includes(needle)) problems.push(`${path}: ${name} lacks "${needle}" (got "${value}")`);
  }
  const policy = response.headers.get(CSP);
  if (policy === null) {
    problems.push(`${path}: ${CSP} is missing (CSP_MODE is "${MODE}")`);
  } else {
    for (const needle of CSP_MUST_CONTAIN) if (!policy.includes(needle)) problems.push(`${path}: ${CSP} lacks "${needle}"`);
  }
  if (response.headers.get(CSP_OTHER) !== null) problems.push(`${path}: ${CSP_OTHER} is sent as well (CSP_MODE is "${MODE}")`);
  return problems;
}

const results = await Promise.all(PATHS.map(check));
const problems = results.flat();
if (problems.length === 0) {
  console.log(`headers-check: ${PATHS.length} pages on ${base} carry every security header`);
  process.exit(0);
}
console.error(`headers-check: ${problems.length} problem${problems.length === 1 ? "" : "s"} on ${base}`);
for (const problem of problems) console.error(`  - ${problem}`);
process.exit(1);
