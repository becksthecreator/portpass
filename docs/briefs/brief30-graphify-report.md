# Brief 30: graphify, a code map Claude Code checks before it reads files — report

Backfilled on 11 Oct 2026 from the PR body (brief 33). **Held: not merged.** The PR says it is not to merge without Antonio's OK.

| Part | PR | What it is |
| --- | --- | --- |
| one | [#190](https://github.com/becksthecreator/portpass/pull/190) (open, CI green), branch `chore/graphify` | A `## graphify` section at the end of `CLAUDE.md`; `.claude/skills/graphify/` and `.claude/CLAUDE.md`; a new `.claude/settings.json` with two non-blocking `PreToolUse` hooks; `.gitignore`, `.claudeignore` and one `.gitattributes` line |

## Done on Antonio's machine, not in the PR
- graphify 0.9.85 installed with uv (its folders moved to `%USERPROFILE%\.uv\` because the desktop app redirects writes under `AppData\Roaming`).
- Post-commit and post-checkout hooks in the main `portpass` folder only; worktree sessions run `graphify update .` themselves.

## The map
952 code files, 5,872 nodes, 18,714 links, 321 communities, built locally with no API calls in about two minutes.

## How well it answers
- `graphify explain <symbol>`: good, with files and lines.
- `graphify query "<question>"`: noisy; it walks keywords. Use symbol names.
- `graphify path`: works within server code; a browser `fetch` to a route is not an edge.

## Migrations, env var names, tests
None. Configuration only; CI green.

## For Antonio
1. Merge #190, or say no. On any machine without graphify (Adon's, a cloud session) the hooks show a non-blocking "command not found" on every Bash, Grep, Read and Glob call. Say if the hook should do nothing when graphify is missing.
2. Its `CLAUDE.md` text says "MUST query first"; with `query` as noisy as it is, `explain` and `path` are the useful ones.
3. Brief 33 does not merge or change #190; it is listed under "In flight" in `docs/ops/STATE.md`.
