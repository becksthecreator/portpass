// Lighthouse mobile on / against this branch's build (brief 22): the
// motion-checks workflow runs Lighthouse three times on localhost with
// the same mobile settings as lighthouse.yml (375x812 at 2x, simulated
// slow 4G and a 4x slower CPU), and this reads the three reports, keeps
// the median, and appends a table to motion-checks/report.md. It exits 1
// when the median performance score is under 0.85, a run's layout shift
// (CLS) is 0.05 or more, or a run has no score at all; the workflow lets
// that step fail without failing the job, because localhost reads a few
// points under production. The floor that blocks is production's, in
// lighthouse.yml after each merge; compare a branch with main's run of
// this same job.
//
//   node scripts/motion/lighthouse.mjs [directory of Lighthouse JSON reports]
import { appendFileSync, readdirSync, readFileSync } from "node:fs";

const dir = process.argv[2] ?? "motion-checks/lighthouse";
const PERF_FLOOR = 0.85;
const CLS_LIMIT = 0.05;

const reports = readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(`${dir}/${name}`, "utf8")));
if (!reports.length) {
  appendFileSync("motion-checks/report.md", "\n## Lighthouse mobile on / (this build, localhost)\n\n- FAIL: no Lighthouse report was written.\n");
  console.error(`No Lighthouse reports in ${dir}.`);
  process.exit(1);
}

// The element Lighthouse took as the largest paint, as a short label.
function lcpElement(report) {
  const details = report.audits?.["largest-contentful-paint-element"]?.details;
  const stack = [details];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== "object") continue;
    if (item.node && (item.node.nodeLabel || item.node.snippet)) return String(item.node.snippet ?? item.node.nodeLabel).slice(0, 90);
    for (const value of Object.values(item)) if (value && typeof value === "object") stack.push(value);
  }
  return "not reported";
}

// A metric Lighthouse could not measure is null, never a guess.
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const runs = reports.map((report) => ({
  performance: num(report.categories?.performance?.score),
  cls: num(report.audits?.["cumulative-layout-shift"]?.numericValue),
  lcp: num(report.audits?.["largest-contentful-paint"]?.numericValue),
  tbt: num(report.audits?.["total-blocking-time"]?.numericValue),
  element: lcpElement(report),
}));
const scored = runs.filter((run) => run.performance !== null);
const median = scored.length ? [...scored].sort((a, b) => a.performance - b.performance)[Math.floor(scored.length / 2)] : null;
const worstCls = Math.max(...runs.map((run) => run.cls ?? 0));

const fixed = (value, digits) => (value === null ? "n/a" : value.toFixed(digits));
const ms = (value) => (value === null ? "n/a" : `${Math.round(value)} ms`);
const row = (label, run) => `| ${label} | ${fixed(run.performance, 2)} | ${fixed(run.cls, 3)} | ${ms(run.lcp)} | ${ms(run.tbt)} |`;
const lines = [
  "",
  "## Lighthouse mobile on / (this build, localhost)",
  "",
  "| Run | Performance | CLS | LCP | TBT |",
  "| --- | --- | --- | --- | --- |",
  ...runs.map((run, i) => row(String(i + 1), run)),
  ...(median ? [row("**Median**", median)] : []),
  "",
  `Largest paint: \`${(median ?? runs[0]).element.replace(/`/g, "'")}\``,
];

const failures = [];
if (scored.length < runs.length) failures.push(`${runs.length - scored.length} run(s) had no performance score`);
if (median && median.performance < PERF_FLOOR) failures.push(`median performance ${median.performance.toFixed(2)} is under ${PERF_FLOOR} here (compare with main's run of this job; production is gated after the merge)`);
if (worstCls >= CLS_LIMIT) failures.push(`a run's layout shift ${worstCls.toFixed(3)} is ${CLS_LIMIT} or more`);
lines.push("", failures.length ? `- BELOW: ${failures.join("; ")}.` : `- PASS: median performance ${median.performance.toFixed(2)} (at least ${PERF_FLOOR}) and no run's layout shift at ${CLS_LIMIT} or more.`);

const text = `${lines.join("\n")}\n`;
appendFileSync("motion-checks/report.md", text);
console.log(text);
if (failures.length) process.exit(1);
