# Hermes Agent for PortPass

How Hermes Agent works, how it is set up on Antonio's laptop, and how to run the PortPass pipeline with it without breaking the rules PortPass lives by. Written 12 Oct 2026 against the Hermes docs and source of that day, and checked against both. Hermes moves fast, so re-check a command with `hermes --help` when something differs.

Files in this folder:

| File | What it is |
|---|---|
| `README.md` | This guide |
| `SOUL.md` | Scout's voice and hard limits. Copied to `%LOCALAPPDATA%\hermes\SOUL.md` |
| `skills/portpass-scout/` | The lead procedure: research, score, draft, hand to a founder |
| `skills/lead-funnel-audit/`, `skills/portpass-idea-check/`, `skills/portpass-search-visibility/` | Antonio's three Claude skills, copied as they are, with one phrase in lead-funnel-audit reworded so it no longer suggests PortPass takes payment. They mention files that live in the Claude project (`Get_Found_Get_Booked_Playbook_7Oct.md`, `11_SEO_Foundations.md`). Hermes cannot see those, so Scout says "not available here" rather than guessing. Copy them into `Documents\PortPass-Scout\reports\` if Scout should use them |
| `config.example.yaml`, `env.example` | The non-secret settings, and the names (never values) of the secrets |
| `apply.ps1` | Lays all of the above over a Hermes install. Safe to run again |

## The short version

- Hermes Agent is an open-source agent from Nous Research. It runs on your own laptop. It remembers between sessions, can save a procedure as a skill, and you talk to it from Telegram on your phone. Think of it as an assistant that works through your week, not a coding tool.
- On this laptop it runs natively on Windows under `%LOCALAPPDATA%\hermes`. The command is `hermes`. The chat app that controls it is Telegram, because Telegram's bot door is official, free and carries no ban risk. Scout still writes WhatsApp messages. You send them from your own WhatsApp.
- Its persona here is **Scout**. Scout researches a business, scores it with the Handbook §8 score, drafts the first WhatsApp message, keeps the pipeline notes, reminds you to follow up, and writes your morning brief. Antonio sends every message himself, by hand, one to one. That is PortPass rule 5, and it is also what WhatsApp's terms and Hermes's own WhatsApp guide require. Hermes brings clients in by making the human send fast, well and often, not by sending.
- Three things are yours to do, because they are logins: pick and pay for a model (step 2), create the Telegram bot (step 3), and press "install" on the background service (step 5). Everything else is scripted and already applied.

## How approving works here

Messages to businesses: nothing leaves Hermes. Every draft lands in your Telegram chat. You add the business in Admin → Leads, paste the draft there, and press "Open in WhatsApp" yourself. That paste is the approval. There is no setting that changes this.

Hermes asks you for two kinds of thing only.

1. A risky command on the laptop (deleting files, installing software, pushing code). You get a Telegram message with the command and the choices Approve, Approve for this session, Always, Deny. Typing `approve` or `deny` works too. If you do nothing for five minutes it is denied.
2. A skill it wrote for itself. Type `/skills pending` to see what is waiting, `/skills diff <id>` to read it, then `/skills approve <id>` or `/skills reject <id>`.

Scheduled runs never get to ask. A risky command inside the morning brief or a follow-up check is denied on the spot.

## 1. What it is, and what Scout can do

**What Scout can do for you, in plain words.**

- Take a business name, a Maps link, a flyer photo or a pasted ad and come back with research, a score and a reason.
- Write the first WhatsApp message (under 55 words) and the day-four follow-up. You send both.
- Keep the pipeline list and the notes on every lead, and remind you who is due today.
- Send a morning brief to your phone at 7:30 on weekdays, and a funnel review on Friday.
- Read screenshots and photos, search the web, read public websites, and read the PortPass repo.
- Stress-test an idea (`/portpass-idea-check`), map a funnel (`/lead-funnel-audit`), check how a business shows up on Google and in AI answers (`/portpass-search-visibility`).
- Write a brief for Claude Code when a business needs a page built.
- Answer "what next" at any time of day, from your phone.

**What it cannot do:** send anything to a customer or a business, open Instagram, Facebook, Messenger or WhatsApp Web, use your logins, or touch money.

**Compared with Claude Code.** Claude Code (what you use now) is a coding agent that lives in a terminal session with a repo. It is excellent at briefs: read the brief, change the code, open the PR. It forgets when the session ends unless you keep memory files, and it does nothing while you sleep. Hermes is built around the opposite assumptions: keep running, keep learning, be reachable from your phone.

**The parts, in the order you will meet them.**

- **The agent loop and its tools.** One model (you choose which) with sixty-odd tools: terminal, files, web search and page reading, a browser it drives itself with no window, image reading, image generation, code execution, a to-do list, memory, skills, scheduling, and subagents. It also speaks MCP, the plug standard that lets it use the same Supabase, Vercel and GitHub connections Claude Code uses, when you wire them in later.
- **The gateway.** One background process that connects to the chat apps you configured, keeps one long session per chat, runs the scheduler, and keeps a delivery ledger so a reply survives a crash. You talk to the same agent from Telegram on your phone and from the terminal on the laptop.
- **Memory.** Two small files the agent keeps itself: `MEMORY.md` (facts about the work, 2,200 characters) and `USER.md` (how you like to work, 1,375 characters), loaded into every session. Behind them, full-text search over every past session, so "what did we decide about Carv's prices" is a lookup, not a guess.
- **Skills.** Procedures as Markdown (`SKILL.md`), the same open standard Claude's skills use. Hermes ships a few dozen, installs more from a hub, and proposes its own after it completes a multi-step job. On this laptop nothing it writes about itself is saved until you approve it: `/skills pending` shows what is waiting, `/skills approve <id>` saves it.
- **Goals.** `/goal <text>` sets a standing objective. After every turn a judge model checks whether it is done. If not, Hermes continues on its own, up to 20 turns. `/goal gate add <command>` adds a check that must pass first. This is the "keep going until it is actually finished" mode.
- **Cron.** `hermes cron create "weekdays at 7:30am" "<prompt>" --deliver telegram`. Plain-English schedules, results delivered to your chat, a `[SILENT]` reply when there is nothing to say.
- **Delegation and the board.** `delegate_task` spawns subagents with their own context for parallel work. The kanban board (`hermes kanban`) is a to-do board with columns, kept in a small database file on the laptop, where named profiles pick up cards and hand back a summary. This is how "finish the business" work gets queued later without you re-prompting.
- **Profiles.** A profile is a whole separate Hermes home (config, memory, skills, bot token). A second profile for code work is a later step, not a day-one one.
- **Approvals and limits.** Risky shell commands are classified by a small model and either auto-approved, auto-denied or sent to you. Scheduled and unattended runs can never run a risky command. There is a deny-list of command patterns, a website blocklist, a hard blocklist nothing can override, an allowlist of who may talk to the bot, and a one-command emergency stop: `hermes pause`.

What it is not: it is not sandboxed on this laptop (no Docker here), it is not a CRM, and it has no way to message anyone but you. It is a very capable assistant you can reach from your phone. It never has a WhatsApp number of its own.

## 2. Where things live on this laptop

| Path | Contents |
|---|---|
| `%LOCALAPPDATA%\hermes\` | Hermes home: `config.yaml`, `.env` (secrets), `SOUL.md`, `memories\`, `skills\`, `cron\`, `logs\`, `state.db` |
| `%LOCALAPPDATA%\hermes\hermes-agent\` | The source checkout the installer cloned |
| `%LOCALAPPDATA%\hermes\bin\` | The `hermes` command (added to your user PATH) |
| `%LOCALAPPDATA%\hermes\profiles\<name>\` | Each extra profile's own home |
| `%LOCALAPPDATA%\hermes\gateway-service\`, `plugins\` | The hidden launcher the scheduled task runs; local plugins |
| `%USERPROFILE%\Documents\PortPass-Scout\` | Scout's workspace: `leads\`, `drafts\`, `reports\`. Outside the public repo on purpose. Scout's commands start here |
| `%USERPROFILE%\Documents\Projects\portpass\` | The repo. A session whose working folder is the repo gets `CLAUDE.md` loaded automatically. Scout's working folder is the workspace, so Scout does not; its rules are in `SOUL.md` and the skill instead. A builder profile with its working folder set to the repo would |

Secrets go in `.env` only. `hermes config set NAME value` routes UPPER_SNAKE names to `.env` and dotted names to `config.yaml`, so you rarely edit either by hand. If you edit `config.yaml` in Notepad, use Save As and pick "UTF-8", not "UTF-8 with BOM". The BOM is an invisible mark at the start of the file, and Hermes cannot read the file with it there.

## 3. Setup, step by step

Every command in this guide is typed in Windows Terminal. Press the Windows key, type `Terminal`, press Enter. If a terminal was open while something installed, close it and open a new one, or the `hermes` command will not be found.

### Step 0: install (already done on 12 Oct 2026)

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

The installer needs no admin. It brings its own Git, its own `uv`, Python 3.14 and Node, clones the agent, and adds `hermes` to your user PATH. It was run with `-NonInteractive -SkipComputerUse`: setup and gateway were left for the steps below, and the desktop-control driver was skipped on purpose.

What landed: Hermes `2026.9.24` (git pin `b236008`), Python 3.14.7, Node 26.7, Chromium and `agent-browser` for the browser tool, ffmpeg, ripgrep, about 2.5 GB under `%LOCALAPPDATA%\hermes`. `hermes doctor` passed. The only yellow lines were optional packages (the Telegram library installs itself when Telegram is set up) and upstream `npm audit` notes inside Hermes's own UI bundles, which `hermes update` will pick up.

Not needed on this laptop: WSL, Docker, the Electron desktop app. With 6 GB of RAM, run the CLI and the gateway and leave `hermes desktop` for a bigger machine. Close spare browser tabs when Scout is doing heavy browser research. Free memory was under 300 MB during the install.

Check any time:

```powershell
hermes --version
hermes doctor
```

### Step 1: lay the PortPass setup over it (already done, safe to repeat)

```powershell
powershell -ExecutionPolicy Bypass -File %USERPROFILE%\Documents\Projects\portpass\docs\hermes\apply.ps1
```

It does five things:

- creates the Scout workspace under `Documents\PortPass-Scout\` with an empty `leads\pipeline.md`;
- installs `SOUL.md` and the four skills (`hermes skills list` shows them under `portpass`);
- turns on smart approvals, and denies risky commands in scheduled or unattended runs;
- makes skill writes wait for your approval, keeps subagent fleets small, and points Scout's working folder at the workspace;
- blocks Instagram, Facebook, Messenger and WhatsApp Web for the browser, page reading and image tools, and denies `hermes send` and force-pushes in the terminal.

Run it again whenever you edit a skill or `SOUL.md` in this folder. Optional: `-StrictWrites` also limits file writes to the workspace and the Hermes home.

### Step 2: choose how the model is paid for (Antonio)

Three paths. Pick one. You can switch later with `hermes model`.

| Path | Command | One line why |
|---|---|---|
| **Anthropic API key** (recommended) | `hermes model` → Anthropic → API key | Same company as Claude Code, pay per token, you set the cap, prompt caching works |
| **Claude Max login** | `hermes model` → Anthropic → subscription login | Only if you already pay for Max with extra usage switched on |
| **Nous Portal** | `hermes setup --portal` | One login, 300+ models and hosted tools, metered credits |

Before you pick:

- Make the key in console.anthropic.com, name it `hermes-laptop`, and set a monthly limit. Do not reuse the Vercel key. Paste it at the hidden prompt inside `hermes model`, never on the command line, because the command line is kept in PowerShell's history file.
- Choose **Claude Sonnet 5.5**. If it is not in the list, choose "Enter custom model name" and type `claude-sonnet-5-5` exactly.
- Sonnet 5.5 costs $2 in and $10 out per million tokens. Opus 5.5 is $4 and $20. Haiku 5.5 is $0.10 and $0.50 while a request stays under 100k tokens. The 4.6 models are the legacy rows now and cost more.
- The Max login works only on Claude Max with extra usage switched on, and Hermes spends those extra credits at ordinary API rates. Claude Pro cannot use it. Do not buy Max for Hermes.
- Nous Portal is a credit wallet, not a flat fee. On 12 Oct 2026: $20 for $22 of credits (Plus), $100 for $110 (Super), $200 for $220 (Ultra), plus top-ups. Claude is at Anthropic's list price and the hosted tools are priced per use. Whether prompt-cache discounts pass through is not documented, which can double or quadruple the bill. If you go this way, try Plus for a week and read the usage page before choosing a tier.

Then test it:

```powershell
hermes
```

Ask something checkable: "What skills do you have? Summarise /portpass-scout in five lines." Success looks like: the banner shows your model, it answers, it names the four PortPass skills. If this does not work, stop here and fix it (`hermes doctor`, `hermes model`). Do not add Telegram to a broken base.

Then send the small side jobs to the cheap model. Type these six lines, one at a time:

```powershell
hermes config set auxiliary.goal_judge.provider anthropic
hermes config set auxiliary.goal_judge.model claude-haiku-5-5
hermes config set auxiliary.background_review.provider anthropic
hermes config set auxiliary.background_review.model claude-haiku-5-5
hermes config set delegation.provider anthropic
hermes config set delegation.model claude-haiku-5-5
```

Leave compression alone. It must stay on a model with a window as big as the main one.

### Step 3: the Telegram control channel (Antonio)

You talk to Scout in Telegram, not WhatsApp. Two reasons. Hermes's WhatsApp link pretends to be WhatsApp Web, which breaks WhatsApp's terms and can get the number banned, and your WhatsApp number is the PortPass business line. Telegram gives bots an official, free door, and only the people on your allowlist can open it. Scout still writes WhatsApp messages. You send them from your own WhatsApp.

1. In Telegram, open **@BotFather**, send `/newbot`, give it a name (for example "PortPass Scout") and a username ending in `bot`. Copy the token. It is a password.
2. Open **@userinfobot** and note your numeric user id. Adon's too if he should talk to it.
3. Run `hermes gateway setup` and choose Telegram, or put the two values in `%LOCALAPPDATA%\hermes\.env`:

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_USERS=<your id>,<Adon's id>
```

Without the allowlist nobody can give Scout work. A stranger who messages the bot gets a pairing code and nothing else. You can let that person in with `hermes pairing approve telegram <code>`, or ignore it. Once the allowlist is set, unknown senders are dropped silently. Never set `GATEWAY_ALLOW_ALL_USERS=true` on an agent with a terminal.

4. Test it in the foreground. Type `hermes gateway` and leave that window open. In Telegram, message the bot. Send `/sethome` in that chat so the morning brief lands there. Now do step 4 while the window is still open. Press Ctrl-C in that window only after your first lead has come back. Step 5 then makes it run on its own.

### Step 4: the first lead

With `hermes gateway` still running from step 3, open the bot chat in Telegram and type this as one message, with a real business in place of the example:

```
/portpass-scout Example Fit Studio, a gym on Carmichael Road, Nassau. Prices are on their Instagram, bookings by WhatsApp DM. <paste their Maps link>
```

A photo of a flyer works too. Attach it and put `/portpass-scout score this` as the caption. Strip any person's name or number out of a chat before you paste it.

Scout may ask you one question first. Answer in plain words. Within a few minutes you get a verdict line, the funnel and its leak, the score with its signals, a draft under 55 words, and a next step with a date. The same goes into a file under `Documents\PortPass-Scout\leads\`.

Then: add the business in Admin → Leads (it refuses a "do not contact" business), paste the draft there, and send it yourself with "Open in WhatsApp". Never go straight from Telegram to WhatsApp. Nothing is sent until you do that. When they answer, tell Scout: `Example Fit replied: "yes, send me more"`. It updates the notes and drafts the next message.

### Step 5: run it as a service (Antonio)

```powershell
hermes gateway install
hermes gateway status
```

On Windows this registers a scheduled task named `Hermes_Gateway` that starts 30 seconds after logon, runs hidden (a small launcher under `%LOCALAPPDATA%\hermes\gateway-service\`), and restarts itself if it crashes. `hermes gateway stop|start|restart|uninstall` manage it. `schtasks /Query /TN Hermes_Gateway /V /FO LIST` shows the task. The laptop must be on and logged in. Closed-lid sleep stops it, and `hermes update` pauses it for the length of the update. If you later want it awake at night, that is the moment to think about a small rented server in the cloud (a VPS) and `hermes backup` to move the home across.

### Step 6: the routines

Create these from the terminal, or ask Scout in plain words (it uses the same tool):

```powershell
hermes cron create "weekdays at 7:30am" "Morning brief for Antonio: 1) leads whose next-step date is today or overdue, from leads\pipeline.md; 2) the top three leads to message today with their drafts; 3) one line on portpassbahamas.com health (fetch the home page; report status only). Under 200 words. If nothing is due and the site is up, reply [SILENT]." --deliver telegram --name "Morning brief"

hermes cron create "every day at 5pm" "Follow-up check: list every lead in status contacted with no reply after 4 days and draft a short, warm second message for each (under 40 words, no links, no card payments). Deliver as a numbered list Antonio can copy from." --deliver telegram --name "Follow-ups"

hermes cron create "every friday at 4pm" "Weekly funnel review: count leads by status from leads\pipeline.md, name the biggest leak this week, propose next week's ten targets (sections we are filling first), and update reports\week-<date>.md. Keep it to one screen." --deliver telegram --name "Weekly funnel"
```

`hermes cron list` shows them, `hermes cron run "Morning brief"` tests one now, `hermes cron pause <name>` silences it, `hermes pause` stops everything at once.

## 4. "Give it control": what that means here

Hermes gets full control of the research, the drafting, the notes and the reminders, and no control of the send button. Precisely:

| Scout does alone | Scout asks first | Scout never does |
|---|---|---|
| Research a business from public sources; score it; draft messages, follow-ups, page copy and FAQs; keep `leads\` and `pipeline.md`; write the morning brief and the weekly review; search the web; read the repo; prepare a brief for Claude Code; answer "what next" | Anything the approval classifier flags as risky in the terminal (deletes, installs, network pushes); a skill it wrote for itself (`/skills approve <id>`); any change to production, to a live page, or to money; any decision that is yours (it uses its `clarify` tool) | Send a message to a prospect, customer or parent on any channel; open Instagram, Facebook, Messenger or WhatsApp Web; use your social logins; store a person's details or any child's health data; print a key or a PIN; claim card payments work; move or hold money |

### The honest paragraph about messaging prospects

You asked for an agent that messages potential clients and brings them in. Four facts shape what is possible:

1. **Your own rules already settle it.** PortPass rule 5: "No scraping, no bulk messaging, no automation of Instagram, Facebook or WhatsApp. Scout drafts a message; a founder sends it by hand, one to one." Rule 4: nothing is ever sent to a real person by an agent. The Scout screens in Admin → Leads are built that way ("Copy" and "Open in WhatsApp"), and the enrichment code throws away any draft that mentions cards, says "one-stop shop", carries a link or an @account, or runs too long.
2. **The platforms agree.** Hermes's WhatsApp bridge imitates WhatsApp Web. Its own guide says not to automate messages to people who have not messaged first, because numbers get banned, and WhatsApp's terms call linking an unofficial client a violation. The official WhatsApp Cloud API only allows free-form messages inside 24 hours of the customer's last message. Outside that window it needs a pre-approved template, which Hermes does not implement. There is no Instagram or Facebook DM adapter in Hermes at all (checked in the source and the 570-odd-entry plugin catalogue), and Meta only lets a business DM someone who messaged first. Telegram bots cannot start a conversation with anyone.
3. **Hermes itself is built that way.** There is no tool the agent can call to send a message. The source says so in as many words: "the agent must not fire cross-platform messages on its own". The only outbound plumbing is the `hermes send` command and the delivery target on a scheduled job, and both can only reach platforms that are configured. Scout's profile has one platform configured, your Telegram, so the only place anything can go is your chat. The deny-list blocks `hermes send` in the terminal as well, and the website blocklist keeps the browser, page reading and image tools off Instagram, Facebook, Messenger and WhatsApp Web. Web search is not filtered, so a snippet from those sites can still appear in results, but Scout cannot open the page.
4. **The bottleneck was never the send.** Pressing send takes two seconds. Finding the right fifty businesses, learning what each one sells and how it books today, writing a message that names their real problem in under 55 words, and following up on day four: that is hours, and it is exactly what Scout does. Ten good sends a day, every day, with follow-ups, is the growth engine. Scout makes that a fifteen-minute habit on your phone.

**Not allowed today.** Rules 4 and 5 in `CLAUDE.md` forbid an agent sending to anyone on any channel, email included, and `SOUL.md` and the skill say the same. If one day you want Scout to send on its own, the first step is a PR that rewrites rules 4 and 5 in `CLAUDE.md` to say exactly what is allowed: your decision, written down and merged. Only after that would the clean version be email to a business's own published address, one at a time, from a named PortPass address with a working unsubscribe line and the Nassau postal address, each message approved by you in Telegram first, with three DNS records (SPF, DKIM and DMARC) published for portpassbahamas.com so mail from the domain proves it is yours (Resend gives you DKIM; add a `p=none` DMARC record), and then a small brief. Until that `CLAUDE.md` change is merged, Scout drafts and you send, and this paragraph is not a to-do list.

### Compliance notes, kept short

- **Bahamas law today** is the Data Protection Act 2003: a person can opt out of direct marketing by written request and you have 40 days to comply. The Data Protection Act 2025 was passed in December 2025 and makes direct marketing consent-based with heavier penalties, but it starts only when the Minister gazettes a date, and no date was found as of 12 Oct 2026. Build consent in now so nothing changes later. No Bahamian anti-spam email statute was found. Confirm with counsel before any email programme.
- **Channel order for a first contact:** in person or a phone call; then a short personal email to the business's published address; WhatsApp once they have shared their number for that purpose or messaged PortPass first. Only businesses that signed up at an event have a consent record: their lead card shows whether they ticked "PortPass can message me on WhatsApp about my page". Every other lead has no record, so treat it as not given. Call or ask in person first.
- **Mailbox rules bite before the law does.** Gmail, Yahoo and Outlook want SPF, DKIM and DMARC even for one-to-one mail, and a few "report spam" clicks from annoyed owners can sink the domain. Dozens a day at most, from a named person, never a list.
- **Keep the suppression list where it is enforced.** Admin → Leads keeps "do not contact" as a permanent tombstone and refuses to add that business again. Scout cannot see that list. It only reads its own `leads\` folder. So the rule is: add the business in Admin → Leads before you send anything. If Admin refuses it as "do not contact", tell Scout to mark its file `do_not_contact` and drop it. Scout's own notes are a second check, not the list.
- **Research sources:** the business's own website and public pages, its Google Business Profile read one page at a time, directories whose terms allow it. No API harvesting of Maps listings, no follower lists, and a source URL on every fact.
- **SMS is not worth it here:** carrier rules, Twilio's written-consent requirement and no two-way SMS for the Bahamas.

## 5. How to get the most out of it

**Give it the context once.** `SOUL.md` is the voice and the limits (done). Scout only sees `CLAUDE.md` when its working folder is the repo, which it is not, so its rules live in `SOUL.md` and the skill. For standing facts, use memory: tell it "remember: Term 2 runs to December, Carv is drafted, we are filling fitness and weddings first". Memory is small on purpose. Ask it to tidy when the usage line passes 80%.

**Teach it procedures as skills, not as long prompts.** After any job of five or more steps you will repeat, say "save what you just did as a skill called `<name>`". `/learn <url or folder>` turns documentation into a skill. `/skills` lists them. `hermes skills browse` opens the hub. Keep `skills.write_approval: true` so every skill it writes waits for your `/skills approve <id>`.

**Use `/goal` for anything with a finish line.** "`/goal draft` research the twelve wedding vendors in `drafts\targets.md` and produce a lead file for each" turns one message into a session that runs until done, with a judge checking. Add a gate when a check exists: `/goal gate add <command>`.

**Delegate the parallel parts.** "Research these eight gyms in parallel, one subagent each, and give me a table" runs them side by side. Keep `delegation.max_concurrent_children` at 3 on this laptop.

**Route the small jobs to a cheap model.** If you skipped the six `hermes config set` lines in step 2, do them now. Keep compression on a model with at least the main model's context window. Keep one model per session so the system prompt stays cached: switching models mid-session throws the cache away. Keep subagent prompts under 100k tokens, because Haiku 5.5 costs five times more above that line.

**Watch the money.** `/usage` in a session, `hermes insights` for 30 days, `hermes prompt-size` for the fixed cost of every message. A shorter `SOUL.md`, fewer always-on skills and `/new` at natural breaks all lower it.

**Keep sessions short in Telegram.** A chat is one long session until you send `/new`. Start a new one for each new topic or each morning. Memory carries over, the clutter does not.

**Back it up.** `hermes backup` zips the whole home, secrets included (`.env`, the credential vault, `state.db`), so store the zip somewhere private. Run it before `hermes update`.

**Later, the builder.** When Scout is boring (that is the goal), give code work its own agent.

1. `hermes profile create builder --description "Writes PortPass code from briefs, opens pull requests, reads the test results"`
2. Make a second Telegram bot with @BotFather. One token cannot serve two profiles.
3. `hermes -p builder config set terminal.cwd %USERPROFILE%\Documents\Projects\portpass` so it reads `CLAUDE.md`.
4. `hermes -p builder tools enable kanban --platform telegram`, then `hermes kanban init`. `hermes dashboard` shows the board.
5. `hermes gateway status`. One gateway can serve both profiles, so you may not need a second service.
6. `hermes import-agent claude-code --dry-run` shows the 28 engineering skills it would copy from `~/.claude/skills`. Run it for the builder, not for Scout, so Scout's prompt stays small.
7. Hermes brings its own Node, so `npm test` may now run on this laptop. Try it in the repo and note the result in the memory file.

Keep the PortPass PR rules: one branch per brief, screenshots, the report. The automatic tests on GitHub (CI) stay the judge.

### Costs

Rough monthly estimates for the pattern in this guide: about fifteen lead researches a day from Telegram (each around 150k tokens read and 20k written across its turns) plus two hours a day of agent work, side jobs on Haiku 5.5, prices from Anthropic's published list on 12 Oct 2026. Estimates to size the decision, not quotes. The real number comes from `hermes insights` after a week.

| Path | Main model | Both workloads, per month | Notes |
|---|---|---|---|
| Anthropic API | Claude Sonnet 5.5 | about $160 to $370 | The low end assumes most input is served from the prompt cache. Keep one model per session |
| Anthropic API | Claude Opus 5.5 | about $320 to $730 | Twice Sonnet. Switch to it per session with `/model` for hard problems, not as the default |
| Anthropic API | Claude Haiku 5.5 for the research only | about $6 to $56 | Only while each request stays under 100k tokens of prompt. Above that Haiku is billed at 5× |
| Nous Portal | Sonnet 5.5 through the Portal | about $145 to $335 of credits **if** caching is honoured, $450 to $1,000 if it is not | Plus ($22 of credits) lasts three to five days at this volume. Super or Ultra plus top-ups is the realistic tier |

What drives the bill is the 150k tokens of input per research task, not the price per token. A shorter system prompt and skills, a Haiku subagent doing the page reading, `/new` between tasks, and `prompt_caching.cache_ttl: 1h` for the Telegram bot all cut it.

## 6. The first thirty days

**Week 1: the habit.** Provider, Telegram, the first lead. Ten leads through `/portpass-scout`. Send them yourself from Admin → Leads. Morning brief on. Measure: leads contacted.

**Week 2: the loop.** Follow-up and weekly routines on. Import the old prospect tracker into Admin → Leads (the import is built in: source "Prospect Tracker import"), not into Scout. Then paste Scout a list of business name, status, score and next step only, no phone numbers or emails, so `pipeline.md` stays a names-and-status table and Admin → Leads stays the catalogue of record. Ask Scout to save its first self-written skill. Measure: replies, and how long a reply waits for an answer.

**Week 3: the door.** Write the brief for the Scout agent door: a token-scoped API so Hermes can read the business fields of leads in `new` and `contacted` (never `contact_name`, never a founder's notes), write research, score reasons, the draft and the next step, and ask "is this name blocked?" against the do-not-contact tombstones, while status changes, contact details and the send stay human-only. Add a Telegram alert when the "get listed" form creates a lead. Measure: time from lead to first message.

**Week 4: the builder.** Second profile, the board, three small briefs through it end to end with CI green. Measure: pages live.

## 7. Troubleshooting on Windows

| Symptom | Fix |
|---|---|
| `hermes` not found right after install | Open a new terminal. Or run `%LOCALAPPDATA%\hermes\bin\hermes.cmd` |
| Setup or chat errors | `hermes doctor`, then `hermes model`. The recovery order in the docs is doctor, model, setup, `hermes sessions list`, `hermes -c`, `hermes gateway status` |
| Bot does not answer | `hermes gateway status`. Check `TELEGRAM_ALLOWED_USERS` has your numeric id. `hermes logs gateway -n 100` |
| Gateway says the Telegram library is missing | It is an optional package that normally installs itself the first time the gateway starts for Telegram. If it did not, run `hermes gateway setup` again and pick Telegram, or `hermes pm install --extra telegram`, then try again |
| Gateway stops after a restart | `hermes gateway status`. Group policy can block logon tasks. `hermes gateway install` again |
| `config.yaml` will not parse after an edit | A BOM crept in. Re-save as plain UTF-8, or use `hermes config set` |
| It "forgot" something | `type %LOCALAPPDATA%\hermes\memories\MEMORY.md`. Memory shows up in the next session, so send `/new` |
| Something is running away | `hermes pause` stops cron, the board and gateway turns at once. `hermes resume` when you are ready |
| You want it gone | `hermes uninstall --dry-run`, then `hermes uninstall --full` |

## 8. Sources

- Docs home: https://hermes-agent.nousresearch.com/docs
- Installation and Windows native: https://hermes-agent.nousresearch.com/docs/getting-started/installation , https://hermes-agent.nousresearch.com/docs/user-guide/windows-native
- Quickstart and tips: https://hermes-agent.nousresearch.com/docs/getting-started/quickstart , https://hermes-agent.nousresearch.com/docs/guides/tips
- Messaging, Telegram, WhatsApp, WhatsApp Cloud, Email: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/ (and `/telegram`, `/whatsapp`, `/whatsapp-cloud`, `/email`)
- Security: https://hermes-agent.nousresearch.com/docs/user-guide/security
- Memory, Skills, Cron, Goals, Delegation, Kanban, Hooks, Browser, Context files: https://hermes-agent.nousresearch.com/docs/user-guide/features/ (`memory`, `skills`, `cron`, `goals`, `delegation`, `kanban`, `hooks`, `browser`, `context-files`)
- Profiles and Bot Mode: https://hermes-agent.nousresearch.com/docs/user-guide/profiles , https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode
- Providers and Nous Portal: https://hermes-agent.nousresearch.com/docs/integrations/providers , https://hermes-agent.nousresearch.com/docs/integrations/nous-portal , https://portal.nousresearch.com
- Anthropic prices: https://platform.claude.com/docs/en/about-claude/pricing
- CLI and slash commands: https://hermes-agent.nousresearch.com/docs/reference/cli-commands , https://hermes-agent.nousresearch.com/docs/reference/slash-commands
- Source: https://github.com/NousResearch/hermes-agent
