# Dependencies, secrets in code, and the CI that checks them

What stops a bad dependency or a leaked key reaching PortPass, and who does what. Brief 21, part F.

## What runs on every PR

| Check | Where | What it does | Blocks the merge |
|---|---|---|---|
| `npm audit --audit-level=high` | `.github/workflows/ci.yml` | Fails on a high or critical advisory against any dependency, development ones included (it was production dependencies only until 6 Oct 2026). | Yes |
| CodeQL | `.github/workflows/codeql.yml` | GitHub's scanner reads the JavaScript and TypeScript for the security-and-quality query set and files findings under the repository's **Security → Code scanning** tab. Also on every push to main and weekly. | No. A founder reads the findings; the aim is zero open ones. |
| Secrets scan (gitleaks) | `.github/workflows/gitleaks.yml` | Reads the whole git history, every PR and weekly, for anything shaped like a key, token or password. Reports rule, file, commit and line; the match is redacted. `.gitleaks.toml` allows the known TEST values, each with its reason. | Yes |
| Unit tests, type-check, integration tests | `.github/workflows/ci.yml` | As before; the type-check covers every `.ts` file, tests and scripts included. | Yes |

Every GitHub Action the workflows use is pinned to a commit SHA, with the version it corresponds to in a comment beside it. A tag can be moved to different code; a SHA cannot. Dependabot keeps the SHAs current.

## Dependabot

`.github/dependabot.yml`: once a week (Mondays, 07:00 Nassau) one PR for Next.js and React together and one for everything else, plus one for the GitHub Actions. CI checks each like any other PR; a founder merges when green.

**Antonio's click:** repository **Settings → Code security → Dependabot → Dependabot security updates: Enable.** That makes Dependabot open a PR the day an advisory is published for a dependency we use, not only on Mondays. Version updates (the weekly PRs) work from the file alone.

## Secret scanning and push protection

Both are **on** for the repository (GitHub's own, checked 6 Oct 2026): a known key shape pushed to GitHub is reported, and a push that would add one is refused before it lands. The gitleaks scan is the second line, covering shapes GitHub does not know and running where we can read the result.

## The pre-commit hook

`scripts/git-hooks/pre-commit` runs gitleaks on the staged files before a commit is made. Install once per clone:

```bash
git config core.hooksPath scripts/git-hooks
```

It needs gitleaks on the machine (`winget install gitleaks`, `brew install gitleaks`, or the release page). Where it is not installed the hook says so and the commit goes through; the Secrets scan workflow catches it on the PR.

## The one-time history scan

The first run of the Secrets scan workflow on `main` is the one-time scan of the whole history Brief 21 asked for. Its result is written in the PR that added the workflow (Brief 21, part F), names only: rule, file and commit. The report file itself is the workflow run's `gitleaks-report` artifact, kept 90 days.

## Adding a dependency

No machine here runs Node, so `package-lock.json` is written by the **Lockfile** workflow: push a branch named `chore/lockfile-<name>` with the `package.json` change, download the `lockfile` artifact from the run, and commit both files on the feature branch. `npm ci` in CI then installs exactly that.
