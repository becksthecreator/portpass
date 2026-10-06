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
// One of the two must be there (report-only for the first week, then enforced).
const CSP = ["content-security-policy", "content-security-policy-report-only"];
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
  const cspName = CSP.find((name) => response.headers.get(name) !== null);
  if (!cspName) {
    problems.push(`${path}: neither content-security-policy nor content-security-policy-report-only is present`);
  } else {
    const value = response.headers.get(cspName) ?? "";
    for (const needle of CSP_MUST_CONTAIN) if (!value.includes(needle)) problems.push(`${path}: ${cspName} lacks "${needle}"`);
  }
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
