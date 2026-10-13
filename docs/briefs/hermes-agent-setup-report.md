# Hermes Agent for PortPass (Scout): report

Not a numbered brief. Antonio asked in a Claude Code session on 12 Oct 2026 to set up Hermes Agent (Nous Research) on his laptop, explain how it works, and give it control of bringing businesses onto PortPass. One branch, `feat/hermes-agent-setup`, one PR, docs only. No app code changed.

| Part | What it is |
| --- | --- |
| On the laptop | Hermes Agent 2026.9.24 (git pin `b236008`) installed natively under `%LOCALAPPDATA%\hermes`; `hermes doctor` passes; the Scout persona, four skills and the safety config applied; workspace at `Documents\PortPass-Scout\` |
| In the repo | `docs/hermes/`: the guide (`README.md`), `SOUL.md`, `skills/` (portpass-scout plus Antonio's three Claude skills), `config.example.yaml`, `env.example`, `apply.ps1` |

## Decisions
- **Scout never sends.** Rules 4 and 5 stand. Hermes has no agent-callable send tool (verified in its source), only Telegram is configured on its profile, `hermes send` is on the terminal deny-list, and the browser, page-reading and image tools are blocked from Instagram, Facebook, Messenger and WhatsApp Web. A founder adds the business in Admin → Leads, pastes the draft, presses "Open in WhatsApp".
- **Telegram is the control channel**, not WhatsApp: official bot API, no ban risk, bots cannot start conversations. Hermes's WhatsApp bridge imitates WhatsApp Web and its own docs warn against outbound automation.
- **Explore phase only.** One profile, approvals on (`approvals.mode: smart`; cron and unattended runs deny risky commands), `skills.write_approval: true`. A second "builder" profile and the kanban board are a later step.
- **Model advice:** Anthropic API key with Claude Sonnet 5.5 as the main model and Haiku 5.5 for side jobs; the Claude Max login is not a budget path; Nous Portal is a metered credit wallet. Estimate for the described use: $160 to $370 a month on Sonnet 5.5.
- **The repo is public**, so nothing personal is in `docs/hermes/`: paths use `%USERPROFILE%`, ids and tokens are names only, and the lead-file format has no fields for a person's details.
- **Checked twice.** Five read-only fact-checkers verified the Hermes claims against the docs and the installed source; three reviewers then read the files for accuracy, fit with the ten rules, and readability. Their corrections are in the files (current model names and prices, how outbound really works, Windows gateway details, consent and suppression-list wording, step order).

## What the checks found (worth knowing)
- The windows-native doc's paragraph about `pythonw` and detached processes is stale; the task runs a hidden `python.exe` through a `.vbs` launcher under `gateway-service\`.
- `hermes config set` with a list value from Windows PowerShell needs a YAML flow list in single quotes; double quotes are stripped on the way to the executable, and a bare `*.domain` is a YAML alias. `apply.ps1` does this.
- Hermes loads `CLAUDE.md` only when the session's working folder is the repo. Scout's is the workspace, so its rules live in `SOUL.md` and the skill.
- The Scout code's draft check rejects cards, "one-stop shop", links or handles, and more than 65 words; everything else in the message rules is on the model. The skill says so.
- Only event sign-ups carry a WhatsApp consent record on the lead card. Every other lead has none; the guide says to treat it as not given.

## Migrations, env var names
None in the repo. On the laptop, `%LOCALAPPDATA%\hermes\.env` will hold `ANTHROPIC_API_KEY` (or a Nous Portal login), `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_USERS`. Names only; Antonio types the values.

## Tests run
No app code changed, so CI only. Every new file was scanned for the Windows account name, email addresses, phone numbers, key-shaped strings and health words: none. `hermes --version`, `hermes doctor`, `hermes skills list` and `hermes config get` for every key `apply.ps1` sets were run on the laptop and read.

## For Antonio
1. `hermes model`: make a new Anthropic key named `hermes-laptop` with a monthly limit, paste it at the hidden prompt, choose Claude Sonnet 5.5 (type `claude-sonnet-5-5` if it is not listed). Then the six `hermes config set` lines in the guide, step 2.
2. Telegram: @BotFather → `/newbot`; @userinfobot for your id; `hermes gateway setup` → Telegram. Test with `hermes gateway` in the foreground, send `/sethome`, run the first lead, then `hermes gateway install`.
3. Decide whether to write the "Scout agent door" brief (week 3 in the guide) so Scout can read business fields of leads and check the do-not-contact list without touching contact details or the send.
