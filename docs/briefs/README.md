# Briefs

A brief is the written request a piece of PortPass work starts from: why, what to build in which order, the rules it could break, what to report back, and when it is done.

- **Written with `/brief`.** In Claude Code, type `/brief` followed by the request in plain words. The command (`.claude/commands/brief.md`) turns it into a brief in the house format and saves it here as `<NN>_<slug>.md`, numbered after the highest one in this folder (the command starts at 20 when there is none yet).
- **They also live in the Beckford HQ project.** The Claude project "The Beckford HQ" keeps the briefs too, in its `ClaudeCode_Queue_Sept29/` folder, with the Handbook. Every brief up to and including 20 was written there.

The rules every brief works within are in `CLAUDE.md` at the top of the repo.

## Borrowed from everything-claude-code (brief 23, 6 Oct 2026)

Three agents in `.claude/agents/` (`security-reviewer`, `planner`, `tdd-guide`) started from the kit at https://github.com/worldflowai/everything-claude-code, commit `432485ba6b92c14fb357276a98957f348bcff9ee` (23 Jan 2026): a fork of `affaan-m/everything-claude-code` at its commit `5230892e`, plus one file, `WORLDFLOWAI.md`. We read the kit's agents, kept their checks and rewrote them in our format and voice; `CLAUDE.md` wins where they differ. Nothing from the kit is installed or run.

Left out, on purpose:

- `hooks/` and `scripts/hooks/`: they run on every session start, edit and stop, and shell out to `npx prettier` and `npx tsc` on a founder's machine.
- `scripts/`: Node scripts the kit asks you to run; nothing from the kit executes here.
- `mcp-configs/`: a list of third-party MCP servers (`npx` packages and hosted URLs) nobody here has vetted.
- `contexts/` and the session memory under `~/.claude/sessions`: they persist session state across runs, which no PortPass agent does.
- The agents' blockchain, wallet, coverage-target and `npm install --save-dev` content: PortPass holds no money (rule 1) and adds tools by brief, not by agent.

## Skills copied in (brief 33, 11 Oct 2026)

Five skills in `.claude/skills/`, copied from two pinned commits after reading every file. The clones were made in a scratch folder outside the repo and deleted. No plugin, hook, statusline, `plugin.json`, settings, agent or command came with them, and nothing from either repo was run. Each copied `SKILL.md` starts with a note naming its source; `CLAUDE.md` wins where they clash.

**Ponytail**, https://github.com/DietrichGebert/ponytail at `9b58c1ffb790c075ca32e70a89cf1d80588f4abf`:

- Taken: `skills/ponytail/SKILL.md`, `skills/ponytail-review/SKILL.md`, `skills/ponytail-audit/SKILL.md`, unchanged under the note.
- Left: the plugin and its hooks (a session-start hook loads the persona into every session and subagent and nudges a statusline into settings); `plugin.json`; `ponytail-debt`, `ponytail-gain` and `ponytail-help` (the brief named three skills).

**agent-skills** (Addy Osmani), https://github.com/addyosmani/agent-skills at `1be8e34187e34647bb83adc3a1323b26ae6f6abe`:

- Taken: `skills/shipping-and-launch/` and `skills/performance-optimization/` (with its `references/optimization-patterns.md`), and the four shared checklists they link to (`definition-of-done`, `security-checklist`, `performance-checklist`, `accessibility-checklist`), now in `.claude/skills/shipping-and-launch/references/` with the links re-pointed.
- Changed: every line that installs or runs a package is gone (`npx bundlesize`, `npx lhci`, `npx lighthouse`, the bundle analysers, `npx axe-core`, `npx pa11y`, and the security checklist's install matrix and install-script gate), replaced by a pointer to what PortPass already runs. The security checklist's `git diff --cached | grep` for secrets prints any match, so it became "CI's gitleaks scan; name the file, never print a match" (rule 6).
- Left: the other 23 skills (among them `using-agent-skills`, which tells the agent to load a skill on any hint of a match), the other three shared references, the repo's `CLAUDE.md` and `AGENTS.md`, `hooks/`, `agents/`, `commands/`, `scripts/`, `evals/`, `docs/`, `plugin.json` and the per-tool plugin folders (the brief named two skills).

**Not taken, and why:**

- **everything-claude-code** (`affaan-m/ecc`): only the idea of a plain Markdown handoff, built here as `docs/ops/STATE.md` and `/handoff`. No plugin, npm runtime, hooks, MCP server or Memory Vault.
- **OmniRoute**: it routes our data through many third-party free tiers and needs many provider keys. Not for a product that holds families' data.
- **Agent Reach**: it works through browser cookies and logged-in sessions for Instagram, X and Reddit, which breaks our no-log-in, no-scraping rules (rules 5 and 6).
