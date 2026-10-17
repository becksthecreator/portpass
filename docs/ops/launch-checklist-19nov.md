# Launch checklist: Thursday 19 Nov 2026

Futprep's Term 2 registration opens to parents at 05:00 UTC (midnight in Nassau) on Thursday 19 Nov 2026. Checked against `main` at ff452a9 on 11 Oct 2026 from the `shipping-and-launch` skill (agent-skills 1be8e34). Report-only: nothing was fixed. Live facts come from read-only `curl` of public pages that day.

## Code Quality
| Check | Result | Evidence |
|---|---|---|
| All tests pass (unit, integration, e2e) | pass | Unit and integration ran in CI on every brief 27 PR (#191–#195), merged on green. The Phase 1 end-to-end run (38099844869) passed on branch C; not re-run after #194 and #195 |
| Build succeeds with no warnings | unchecked: Claude Code | `npx next build --webpack` passes in CI; its warnings have not been read. Vercel builds with Turbopack |
| Lint and type checking pass | fail | Types pass in the build. Lint is not in CI (CLAUDE.md); #176 adds it and is open; 35 warnings |
| Code reviewed and approved | pass | `reviewer` and `security-reviewer` on every PR; brief 27 fixed every medium-and-above finding before merge. Approval is the founders' merge-on-green rule; `main` has no required checks |
| No TODO comments that should be resolved before launch | pass | One: `lib/auth/rateLimit.ts:5` (move the limiter to the database), marked optional; the firewall rule covers it (Security) |
| No `console.log` debugging statements in production code | pass | None in `app/`, `lib/`, `db/`, `middleware.ts` or `instrumentation.ts` outside tests |
| Error handling covers expected failure modes | pass | `app/error.tsx`, `app/not-found.tsx`; named failures with plain answers in `app/api/futprep/registrations/route.ts` (term closed, taster full, duplicate); `/api/health` answers 503 when the database is down |

## Security
| Check | Result | Evidence |
|---|---|---|
| No secrets in code or version control | pass | `gitleaks.yml` on every PR, every push to `main` and weekly; GitHub secret scanning and push protection on (`docs/security/dependencies.md`) |
| The ecosystem's dependency audit (`npm audit`, `pip-audit`, `cargo audit`, ...) shows no critical or high vulnerabilities | pass | `npm audit --omit=dev --audit-level=high` blocks in `ci.yml`. A dev-only high (`braces` via `eslint-config-next`) is reported, not blocking; it never ships |
| Input validation on all user-facing endpoints | fail | Public routes use zod (`lib/api/body.ts`); 91 signed-in routes still read bodies themselves (`lib/api/body.static.test.ts`), Futprep's staff routes among them |
| Authentication and authorization checks in place | pass | RLS and a policy on every table (`202610180001_rls_policies.sql`), held at zero in CI by `admin_database_checks()`; admin needs a TOTP code (`lib/auth/admin.ts`); staff PINs scrypt-hashed, 15-minute lock |
| Security headers configured (CSP, HSTS, etc.) | fail | HSTS (preload), nosniff, X-Frame-Options, Referrer-Policy and Permissions-Policy are live. The CSP is report-only (`CSP_MODE`, `lib/securityHeaders.ts`) until #185 and #183 merge |
| Rate limiting on authentication endpoints | fail | In-app limits (`app/api/auth/send`, `verify`: 5 per email per 10 minutes) are per server instance; the PIN lock is in the database. The firewall's sign-in rule and Supabase's OTP expiry are unticked in `docs/security/README.md` |
| CORS configured to specific origins (not wildcard) | pass | No `Access-Control-Allow-Origin` in the code; live `/api/health` sent none to a foreign origin. Same-origin only |

## Performance
| Check | Result | Evidence |
|---|---|---|
| Core Web Vitals within "Good" thresholds | unchecked: Antonio | Field data is in Vercel Speed Insights (tag live). Lab: Lighthouse mobile Performance 0.92–0.94 on Futprep's home (run 38142720623) |
| No N+1 queries in critical paths | pass | Futprep's offer and registration reads batch with `Promise.all` (`db/registrations.ts`); the pilot seed loop runs once. Only the registration path was read |
| Images optimized (compression, responsive sizes, lazy loading) | pass | Uploads resized and stripped (`lib/imageProcess.ts`); AVIF and WebP through `next/image` (`next.config.ts`). 34 plain `<img>` tags remain, mostly on staff and admin screens |
| Bundle size within budget | fail | No budget is set: `lighthouserc.json` asserts category scores only |
| Database queries have appropriate indexes | pass | `registrations` on (program_id, term_id), organisation, payment status, family phone and email; `payment_requests` and `booking_requests` indexed (`supabase/migrations/`) |
| Caching configured for static assets and repeated queries | pass | `/_next/static` is `immutable` for a year; the home page came from Vercel's cache (`X-Vercel-Cache: HIT`) |

## Accessibility
| Check | Result | Evidence |
|---|---|---|
| Keyboard navigation works for all interactive elements | unchecked: Antonio | Tab through `/futprep/register` and a coach's session request on a laptop; see the focus line |
| Screen reader can convey page content and structure | unchecked: Antonio | VoiceOver on `/futprep/register`. Lighthouse found no missing names or labels on Futprep's home |
| Color contrast meets WCAG 2.1 AA (4.5:1 for text) | pass | `lib/businessTheme.ts` enforces AA; `lib/futprepTheme.test.ts` holds every Flamingo Night text pair to 4.5:1; #195 fixed the staff login links |
| Focus management correct for modals and dynamic content | fail | The private-session drawer (`app/futprep/coaches/PrivateSessionBooking.tsx`, `role="dialog"`) does not move focus in, close on Escape or hand focus back |
| Error messages are descriptive and associated with form fields | fail | Plain and announced (`role="alert"`), but one message for the whole form: no `aria-describedby` or `aria-invalid` in `app/futprep/register/` |
| No accessibility warnings in axe-core or Lighthouse | unchecked: Claude Code | Futprep's home scores 1.00. `/futprep/register` is in the Lighthouse run (floor 0.95); its last score was not read |

## Infrastructure
| Check | Result | Evidence |
|---|---|---|
| Environment variables set in production | fail | `CRON_SECRET`, `RESEND_WEBHOOK_SECRET`, `BACKUP_HEARTBEAT_SECRET` unticked in `docs/security/README.md`. Without `CRON_SECRET`, `/api/cron/daily` answers 503 and its jobs (billing, demo reset, pruning) do not run (`lib/cron.ts`) |
| Database migrations applied (or ready to apply) | unchecked: Claude Code | Compare Supabase's applied list with the 104 files in `supabase/migrations/`. Brief 27's three were applied before merge |
| DNS and SSL configured | pass | http answers 308 to https; HSTS preload; apex and www both answer 200 (www does not redirect to the apex) |
| CDN configured for static assets | pass | Vercel's edge; static files `immutable`, cache HIT |
| Logging and error reporting configured | pass | Server errors go to `site_errors` (Admin → Health) through `instrumentation.ts`, with a spike alert; emails in `message_log`. A browser-side error stays in the visitor's console (`app/error.tsx`) |
| Health check endpoint exists and responds | pass | `app/api/health/route.ts`: 200, database ok, 0.4 s on 11 Oct. No uptime monitor that calls it is named in the repo |

## Documentation
| Check | Result | Evidence |
|---|---|---|
| README updated with any new setup requirements | fail | `README.md` last changed 9 Sep; it still describes the Term 1 pilot and the old hosted site. Setup lives in `CLAUDE.md` and `docs/security/env-vars.md` |
| API documentation current | n/a | PortPass offers no API to outsiders; its routes serve its own pages. The webhook and heartbeat are in `env-vars.md` |
| ADRs written for any architectural decisions | fail | None in the repo; decisions live in brief reports and code comments |
| Changelog updated | fail | No changelog on `main`. `docs/ops/STATE.md` ("Live on production", brief 33 A) is not merged yet |
| User-facing documentation updated (if applicable) | fail | Brief 27 report: the Saturday pages still show Term 1's dates (`offerings` 1, 2); Term 2's 12 Dec taster is unconfirmed |

## Verification
| Check | Result | Evidence |
|---|---|---|
| **Before deploying** | | |
| Pre-launch checklist completed (all sections green) | fail | 12 fails and 6 unchecked in the six sections above |
| Feature flag configured (if applicable) | n/a | No flags. The opening is data: `program_terms` 158, 159 active, opening 19 Nov 05:00 UTC (brief 27 report; not re-read from the database) |
| Rollback plan documented | pass | Vercel → Deployments → Rollback (`docs/security/incident-response.md`) or a revert PR; switch-back SQL for every changed row in `docs/briefs/brief27-futprep-reset-report.md` |
| Monitoring dashboards set up | pass | Web Analytics and Speed Insights tags live; Admin → Health, Security and Phase 1; four alert emails (`lib/alerts.ts`) |
| Team notified of deployment | unchecked: Antonio | Futprep's coaches and front desk know registration opens at midnight, Nassau time |
| **After deploying** | | |
| Health check returns 200 | pass | 200 on 11 Oct; check again on 19 Nov |
| Error rate is normal | unchecked: Antonio | Admin → Health and Vercel logs, on 19 Nov |
| Latency is normal | unchecked: Antonio | Speed Insights and Vercel, on 19 Nov |
| Critical user flow works | fail | The parent's flow passed the end-to-end run, but nobody owns Futprep yet, so `/business/futprep` (dashboard, CSVs) is shut; staff logins have no emails, so coach emails skip (brief 27 report) |
| Logs are flowing | unchecked: Antonio | Vercel runtime logs and Admin → Messages; delivery reports wait on `RESEND_WEBHOOK_SECRET` |
| Rollback tested or verified ready | fail | The restore drill has not been run (`docs/security/restore-drill.md`, drill log); no rollback dry run is recorded |
| **For every shipped service** | | |
| Error budget policy in place: know what action to take when budget drops below 20% and when it's exhausted | fail | No SLO or error budget in the repo; only the site-error spike alert (20 in 10 minutes) |

## Fails to close before 19 Nov
1. Tick the brief 21 switches in `docs/security/README.md`: set `CRON_SECRET`, `RESEND_WEBHOOK_SECRET`, `BACKUP_HEARTBEAT_SECRET`; publish the two firewall rules and bot protection; set Supabase's OTP expiry and session limits (Antonio).
2. Futprep: make its owner in Admin → People, add emails to the staff logins, settle the 12 Dec taster and the Saturday pages' dates (Antonio).
3. Run the restore drill and write its row (Antonio).
4. Merge #185 (its migration is live since 17 Oct), then #183 to enforce the CSP (Antonio, then Claude Code).
5. Fix the private-session drawer's focus and tie registration errors to their fields (Claude Code).
6. Decide #176; if yes, rebase it so lint runs in CI (Antonio, then Claude Code).
7. Merge brief 33 A for the changelog, refresh `README.md`, write a one-page error budget policy (Claude Code).

Can follow the launch: zod on the 91 signed-in routes, a bundle budget, ADRs.
