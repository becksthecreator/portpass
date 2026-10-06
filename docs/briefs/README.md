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
