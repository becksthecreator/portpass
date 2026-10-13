<#
.SYNOPSIS
  Lay the PortPass Scout setup over a fresh Hermes Agent install (native Windows).

.DESCRIPTION
  Idempotent. Run it again after editing SOUL.md or a skill in docs/hermes.
  It does NOT touch secrets: provider login and the Telegram token are
  Antonio's to do (see README.md, steps 2 and 3).

  What it does:
    1. Finds HERMES_HOME (default %LOCALAPPDATA%\hermes) and the hermes CLI.
    2. Creates the Scout workspace: Documents\PortPass-Scout\{leads,drafts,reports}.
    3. Copies docs\hermes\SOUL.md to HERMES_HOME\SOUL.md (backs up the old one).
    4. Copies docs\hermes\skills\* to HERMES_HOME\skills\portpass\<name>.
    5. Sets the non-secret config keys from config.example.yaml with `hermes config set`.
    6. Optionally (-StrictWrites) limits file writes to the workspace, the repo and HERMES_HOME.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File docs\hermes\apply.ps1
  powershell -ExecutionPolicy Bypass -File docs\hermes\apply.ps1 -StrictWrites
#>
[CmdletBinding()]
param(
  [string]$Workspace = (Join-Path $env:USERPROFILE "Documents\PortPass-Scout"),
  [string]$Repo = "",
  [switch]$StrictWrites,
  [switch]$SkipConfig
)

$ErrorActionPreference = "Stop"
# $PSScriptRoot is empty inside the param block on Windows PowerShell 5.1, so derive paths here.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Repo) { $Repo = Split-Path -Parent (Split-Path -Parent $here) }

function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "   [ok] $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   [!!] $text" -ForegroundColor Yellow }

# 1. Hermes home and CLI -------------------------------------------------------
Step "Hermes install"
$hermesHome = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:LOCALAPPDATA "hermes" }
if (-not (Test-Path $hermesHome)) { throw "HERMES_HOME not found at $hermesHome. Install Hermes first (README.md, step 0)." }
$hermes = Get-Command hermes -ErrorAction SilentlyContinue
if (-not $hermes) {
  $candidate = Join-Path $hermesHome "bin\hermes.cmd"
  if (Test-Path $candidate) { $hermes = Get-Command $candidate } else { throw "hermes CLI not on PATH. Open a new terminal, or run $candidate." }
}
Ok "HERMES_HOME = $hermesHome"
Ok ("hermes = " + $hermes.Source)

# 2. Workspace -----------------------------------------------------------------
Step "Scout workspace"
foreach ($sub in @("", "leads", "drafts", "reports")) {
  $p = Join-Path $Workspace $sub
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null; Ok "created $p" } else { Ok "exists  $p" }
}
$pipeline = Join-Path $Workspace "leads\pipeline.md"
if (-not (Test-Path $pipeline)) {
  @"
# PortPass pipeline (Scout's notes)

The catalogue of record is Admin -> Leads on portpassbahamas.com. This table is Scout's working copy; Antonio copies drafts from here into Admin -> Leads or WhatsApp and sends by hand.

| Business | Status | Score | Next step | By |
|---|---|---|---|---|
"@ | Set-Content -Path $pipeline -Encoding utf8
  Ok "wrote $pipeline"
}
$wsReadme = Join-Path $Workspace "README.md"
if (-not (Test-Path $wsReadme)) {
  @"
# PortPass Scout workspace

Hermes Agent (profile: default, persona: Scout) works in this folder.

- leads\        one file per business + pipeline.md
- drafts\       messages, pages and copy drafted for a founder to use
- reports\      morning briefs, weekly funnel reviews, research

Nothing in here is sent to anyone by Hermes. A founder sends, by hand, one to one.
Public repo rules apply: no keys, no personal data about individuals, no children's details.
"@ | Set-Content -Path $wsReadme -Encoding utf8
  Ok "wrote $wsReadme"
}

# 3. SOUL.md -------------------------------------------------------------------
Step "SOUL.md"
$soulSrc = Join-Path $here "SOUL.md"
$soulDst = Join-Path $hermesHome "SOUL.md"
if (Test-Path $soulDst) {
  $same = (Get-FileHash $soulSrc).Hash -eq (Get-FileHash $soulDst).Hash
  if (-not $same) {
    $bak = "$soulDst.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item $soulDst $bak
    Warn "existing SOUL.md backed up to $bak"
    Copy-Item $soulSrc $soulDst -Force; Ok "SOUL.md replaced"
  } else { Ok "SOUL.md already current" }
} else { Copy-Item $soulSrc $soulDst; Ok "SOUL.md installed" }

# 4. Skills --------------------------------------------------------------------
Step "Skills"
$skillsSrc = Join-Path $here "skills"
$skillsDst = Join-Path $hermesHome "skills\portpass"
if (-not (Test-Path $skillsDst)) { New-Item -ItemType Directory -Path $skillsDst | Out-Null }
Get-ChildItem $skillsSrc -Directory | ForEach-Object {
  $dst = Join-Path $skillsDst $_.Name
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
  Copy-Item $_.FullName $dst -Recurse
  Ok ("skill " + $_.Name)
}

# 5. Config --------------------------------------------------------------------
if (-not $SkipConfig) {
  Step "Config (hermes config set)"
  $settings = [ordered]@{
    "terminal.backend"                       = "local"
    "terminal.cwd"                           = $Workspace
    "approvals.mode"                         = "smart"
    "approvals.cron_mode"                    = "deny"
    "approvals.unattended_mode"              = "deny"
    "approvals.single_query_mode"            = "deny"
    "skills.write_approval"                  = "true"
    "goals.max_turns"                        = "20"
    "delegation.max_concurrent_children"     = "3"
    "cron.max_parallel_jobs"                 = "1"
    "browser.use_real_profile"               = "false"
    "security.website_blocklist.enabled"     = "true"
    # Lists are written as YAML flow lists with SINGLE quotes: Windows PowerShell
    # mangles double quotes on the way to a native .exe, and a bare *.domain is a
    # YAML alias. Single quotes survive both.
    "security.website_blocklist.domains"     = "['instagram.com','*.instagram.com','facebook.com','*.facebook.com','messenger.com','*.messenger.com','web.whatsapp.com','*.whatsapp.com','wa.me']"
    "approvals.deny"                         = "['*git push --force*','*rm -rf *','*Remove-Item * -Recurse*','*hermes send*','*| sh*','*| bash*','*| powershell*','*wa.me*','*graph.facebook.com*']"
  }
  foreach ($k in $settings.Keys) {
    & $hermes.Source config set $k $settings[$k] | Out-Null
    if ($LASTEXITCODE -eq 0) { Ok "$k" } else { Warn "could not set $k (exit $LASTEXITCODE); set it by hand: hermes config set $k ""$($settings[$k])""" }
  }
  if ($StrictWrites) {
    # Scout reads the repo; only a builder profile writes to it. The Hermes home
    # must be in the list or skills, memory and cron edits fail.
    $roots = @($Workspace, $hermesHome) -join ";"
    & $hermes.Source config set HERMES_WRITE_SAFE_ROOT $roots | Out-Null
    if ($LASTEXITCODE -eq 0) { Ok "HERMES_WRITE_SAFE_ROOT = $roots" } else { Warn "could not set HERMES_WRITE_SAFE_ROOT; add it to $hermesHome\.env by hand" }
  }
}

# 6. What is left for Antonio --------------------------------------------------
Step "Done. Left for Antonio (secrets, logins):"
Write-Host @"
   1. Provider:   hermes model          (Anthropic API key, OpenRouter, or Nous Portal: hermes setup --portal)
   2. First chat: hermes                (ask: "What skills do you have? Summarise /portpass-scout in 5 lines.")
   3. Telegram:   make a bot with @BotFather, get your user id from @userinfobot, then
                  hermes gateway setup  (or put TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USERS in $hermesHome\.env)
   4. Service:    hermes gateway install   then in Telegram:  /sethome
   5. Check:      hermes doctor ; hermes status
"@
