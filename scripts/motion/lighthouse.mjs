// Lighthouse mobile on / against this branch's build (brief 22): the
// motion-checks workflow runs Lighthouse three times on localhost with
// the same mobile settings as lighthouse.yml (375x812 at 2x, simulated
// slow 4G and a 4x slower CPU), and this reads the three reports, keeps
// the median, appends a table to motion-checks/report.md and fails when
// the median performance score is under 0.85 or any run's layout shift
// (CLS) is 0.05 or more. Production is measured again after each merge by
// lighthouse.yml; this catches a part that would drop / before it merges.
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
  console.error(`No Lighthouse reports in ${dir}.`);
  process.exit(1);
}

// The element Lighthouse took as the largest paint, as a short label.
function lcpElement(report) {
  const details = report.audits["largest-contentful-paint-element"]?.details;
  const stack = [details];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== "object") continue;
    if (item.node && (item.node.nodeLabel || item.node.snippet)) return String(item.node.snippet ?? item.node.nodeLabel).slice(0, 90);
    for (const value of Object.values(item)) if (value && typeof value === "object") stack.push(value);
  }
  return "not reported";
}

const runs = reports.map((report) => ({
  performance: report.categories.performance.score,
  cls: report.audits["cumulative-layout-shift"].numericValue,
  lcp: report.audits["largest-contentful-paint"].numericValue,
  tbt: report.audits["total-blocking-time"].numericValue,
  element: lcpElement(report),
}));
const median = [...runs].sort((a, b) => a.performance - b.performance)[Math.floor(runs.length / 2)];
const worstCls = Math.max(...runs.map((run) => run.cls));

const row = (label, run) => `| ${label} | ${run.performance.toFixed(2)} | ${run.cls.toFixed(3)} | ${Math.round(run.lcp)} ms | ${Math.round(run.tbt)} ms |`;
const lines = [
  "",
  "## Lighthouse mobile on / (this build, localhost)",
  "",
  "| Run | Performance | CLS | LCP | TBT |",
  "| --- | --- | --- | --- | --- |",
  ...runs.map((run, i) => row(String(i + 1), run)),
  row("**Median**", median),
  "",
  `Largest paint: \`${median.element.replace(/`/g, "'")}\``,
];

const failures = [];
if (median.performance < PERF_FLOOR) failures.push(`median performance ${median.performance.toFixed(2)} is under ${PERF_FLOOR}`);
if (worstCls >= CLS_LIMIT) failures.push(`a run's layout shift ${worstCls.toFixed(3)} is ${CLS_LIMIT} or more`);
lines.push("", failures.length ? `- FAIL: ${failures.join("; ")}.` : `- PASS: median performance ${median.performance.toFixed(2)} (at least ${PERF_FLOOR}) and no run's layout shift at ${CLS_LIMIT} or more.`);

const text = `${lines.join("\n")}\n`;
appendFileSync("motion-checks/report.md", text);
console.log(text);
if (failures.length) process.exit(1);
