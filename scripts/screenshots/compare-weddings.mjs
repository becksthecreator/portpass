// Checks the three runs of capture-weddings.mjs agree: the wedding page's
// proof and reviews sections as the server sends them, and every
// WeddingWire snippet the page puts into its widget containers, are the
// same before the change, in the window (main's code after migration
// 202610190002) and after it. Also reads each run's checks. Writes a table
// to the job summary and exits 1 on any difference or failed check.
import { appendFileSync, readFileSync } from "node:fs";

const PHASES = ["before", "window", "after"];
const read = (phase, file) => JSON.parse(readFileSync(`screenshots/weddings/${phase}/${file}`, "utf8"));
const runs = Object.fromEntries(PHASES.map((phase) => [phase, { ssr: read(phase, "ssr.json"), injected: read(phase, "injected.json"), checks: read(phase, "checks.json") }]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const rows = [];
const problems = [];
const row = (what, ok, note = "") => {
  rows.push(`| ${what} | ${ok ? "yes" : "**no**"} | ${note} |`);
  if (!ok) problems.push(what);
};

const injected = runs.before.injected;
row("The page injected all three widgets before the change", injected.length === 3 && ["wpShowRatedWW(", "wpShowRatedWAv3(", "wpShowReviews("].every((call) => injected.some((html) => html.includes(call))), `${injected.length} snippets`);
for (const phase of ["window", "after"]) {
  const label = phase === "window" ? "main's code after the migration" : "this branch";
  row(`Proof section from the server, ${label} = before`, runs[phase].ssr.proof !== null && same(runs[phase].ssr.proof, runs.before.ssr.proof));
  row(`Reviews section from the server, ${label} = before`, runs[phase].ssr.reviews !== null && same(runs[phase].ssr.reviews, runs.before.ssr.reviews));
  row(`Widget snippets injected, ${label} = before (byte for byte)`, same(runs[phase].injected, runs.before.injected), `${runs[phase].injected.length} snippets`);
}
for (const phase of PHASES) {
  const { checks } = runs[phase];
  row(`No capture failed (${phase})`, checks.failures.length === 0, checks.failures.join("; "));
  row(`Wedding page fits 375px (${phase})`, checks.pageWiderThanPhone === false);
}
row("Desk screen fits 375px (this branch)", runs.after.checks.deskWiderThanPhone === false);
row("Desk screen shows the member ID and three switches, no HTML box (this branch)", runs.after.checks.memberIdShown === "946150" && same(runs.after.checks.switchesOn, [true, true, true]) && runs.after.checks.textareasLeft === 0);
row("A Desk save is written to the audit log (this branch)", runs.after.checks.auditEntries >= 1, `${runs.after.checks.auditEntries} entries`);
row("main's save, which writes HTML, is refused once the migration is applied", Boolean(runs.window.checks.oldSaveRefused), runs.window.checks.oldSaveRefused ?? "");

// Not a check: what WeddingWire answered in each run, so the screenshots
// can be read. The reviews widget is never loaded in this job (the PR #26
// rule: no review text in an artifact), so its panel shows the snippet's own
// fallback in all three.
const answered = PHASES.map((phase) => `| ${phase} | ${(runs[phase].checks.weddingWireRequests ?? []).join("<br>") || "none"} |`);
const summary = [
  "## The wedding page before and after (375px)", "", "| Check | Holds | |", "|---|---|---|", ...rows, "",
  "What WeddingWire answered in each run:", "", "| Run | Requests |", "|---|---|", ...answered, "",
  "Screenshots: the `weddings-screenshots` artifact.", "",
].join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
if (problems.length) {
  console.error(`Failed: ${problems.join("; ")}`);
  process.exitCode = 1;
}
