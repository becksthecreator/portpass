Hand this session's work over, so the next session and the Beckford HQ project start from the truth. Brief number, if given: $ARGUMENTS

1. Read `docs/ops/STATE.md` and the newest report in `docs/briefs/`. If the current branch is `main`, stop and say so: `/handoff` writes on a brief's branch, never on `main`.
2. Gather, reading only:
   - `git fetch origin`, the current branch, `git log --oneline origin/main..HEAD`, and `origin/main`'s short SHA;
   - `gh pr list --state open --json number,title,headRefName,statusCheckRollup` and `gh pr list --state merged --limit 20 --json number,title,mergedAt`;
   - the latest preview of each open branch: the Vercel `list_deployments` tool for project `portpass`, or the branch address `https://portpass-git-<branch, / as ->-port-pass.vercel.app`. Never read env var values.
3. Update `docs/ops/STATE.md`, keeping its six sections and about 80 lines:
   - **Live on production**: add what merged since the last update (feature, PR, date).
   - **In flight**: one row per open branch with a PR or unmerged work: branch, PR, what's left, waiting on whom. Drop rows that merged or closed.
   - **Briefs**: number, title, queued / building / merged / held, and a link to its report.
   - **Waiting on Antonio**: one line each. Remove what he has done.
   - **Known issues**: what a reviewer marked and was deferred. Drop what is fixed.
   - **Last updated**: today's date, `main` at `<short SHA>`, by Claude Code.
4. Write or update `docs/briefs/briefNN-<slug>-report.md` for the brief in progress, in the shape of the brief 27 report: the parts and their PRs, decisions, rows switched with the way back, migrations, env var names, tests run, agent output, and numbered items "For Antonio".
5. Check both files: no secret, key, env value, PIN, code, email address, phone number, child's name or health detail. Names of env vars only.
6. Commit the two files to the current branch and push it. Do not merge, do not enable auto-merge, do not push to `main`.
7. Print exactly five lines Antonio can paste into the project chat, and stop:
   - `Brief NN, <title>: <status>, PR #<n> (<checks>)`
   - `Done: <what this session finished>`
   - `Left: <what is still to do>`
   - `Waiting on Antonio: <the items, or "nothing">`
   - `STATE.md updated <date>, main at <short SHA>, branch <branch>`
