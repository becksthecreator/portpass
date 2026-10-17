# Brief 34: lock children's data before launch — report

The Ponytail audit's top five (11 Oct), fixed before Term 2 opens on 19 Nov. Most of the work had already landed in three PRs when the brief arrived. This brief checked each of them against its wording, added what was missing in [#217](https://github.com/becksthecreator/portpass/pull/217), and wrote this report.

| Finding | Fixed in | What brief 34 added in #217 |
| --- | --- | --- |
| 1. Every Futprep staff action reads and writes Futprep's rows only | [#205](https://github.com/becksthecreator/portpass/pull/205) (registrations, payments, attendance, roster, return links) | The session and coach screens: coaches today, who coached, the default lead, open times. Private session requests: every action, and payments. The Team screen: save, remove, restore, one open time, photo. The public coach pages, switching a class on or off, and linking a coach to a staff login. [#209](https://github.com/becksthecreator/portpass/pull/209) had already scoped the request list, its numbers and the coach a request goes to. [#216](https://github.com/becksthecreator/portpass/pull/216) had scoped the public form and the desk's quick add. |
| 2. No overselling | [#200](https://github.com/becksthecreator/portpass/pull/200) (`create_registration_within_cap`, one locked call) | The test the brief asks for: 20 parents at once for a class of 10 gives exactly 10 places. Waitlist promotions and reinstatements are in [#220](https://github.com/becksthecreator/portpass/pull/220) (open, with its own failing-first tests). |
| 3. `additional_notes` only behind `can_view_medical` | #205 | Nothing more was needed. |
| 4. Pickup and emergency details only in authorised views | #205 (out of the roster CSV and the desk cards) | On the child's desk record, the medical view only. On the coach roster, the medical view, and any coach on the session's own day. On screen only, and every day-of view is logged. See "Who sees what" below. |
| 5. Desk balances filtered and paged | [#203](https://github.com/becksthecreator/portpass/pull/203) (the desk list and the money strip) | One child's own record, and the totals after a payment, a void or a fee change, now read every payment past 1,000 (`receivedCentsFor`). |

## Who sees what (Futprep staff screens)

"Medical view" is the CEO login, plus an admin or coach login whose `can_view_medical` switch the CEO has turned on.

| Detail | Desk list (cards) | Child's record (`/futprep/staff/admin/[id]`) | Coach roster (`/futprep/staff/coach`) | Roster CSV, other exports, emails, logs, AI prompts |
| --- | --- | --- | --- | --- |
| Health notes: allergies, conditions, medications, special needs, internal notes (`additional_notes`) | Never | Medical view only | Medical view only (allergies, conditions, medications, special needs; never the internal notes) | Never |
| Authorised pickup | Never | Medical view only (since #217; before, every admin) | Medical view; any coach login on the session's own day (before #217: every coach, every day) | Never |
| Emergency contact (name and phone) | Never | Medical view only (since #217; before, every admin) | Medical view; any coach login on the session's own day (before #217: every coach, every day) | Never |

- **The session's own day** is its date in Nassau. On any other day, a coach without the medical view sees: "Emergency contact and pickup: shown to coaches on the day of the session, and to the logins Alex has allowed."
- **An audit trail.** Each day-of view by a coach without the medical view writes an audit line: `futprep.roster_contacts_day_of`, with the session and the staff login, never a child's details.
- **Never on the roster:** a helper login, or an admin login, even with the medical view. Since #213 (brief 31 D) admins can open the coaching workspace for passports, and their roster points to the child's registration at the desk instead.
- **Saving.** A login without the medical view never changes these fields. The editor hides them and doesn't send them, and the save route drops them whatever the request carries, so a hidden field is never saved blank.
- **Outside Futprep's staff screens, nothing changed.** A business's own registration view shows these fields only to roles allowed to see health (`getBusinessRegistration`). PortPass's Admin Control Center keeps them hidden until a platform owner gives a reason to reveal them. The 90-day purge after a programme ends is unchanged; it needs `CRON_SECRET` set to run (see STATE.md). The privacy page now says the same.

## Files changed in #217
- **Finding 1:**
  - `db/staff.ts`, `db/coachPay.ts`, `db/coaches.ts` and `db/programs.ts`;
  - routes `app/api/futprep/programs/route.ts` and `app/api/futprep/staff/pay/rates/route.ts`, which now answer the new refusals plainly.
- **Finding 4:**
  - `lib/futprepRoles.ts` (`rosterSafetyShown`, `withoutEmergencyDetail`, `withoutEmergencyInput`);
  - `app/futprep/staff/admin/[id]/page.tsx` and `RegistrationDetailEditor.tsx`;
  - `app/api/futprep/staff/registrations/[id]/detail/route.ts`;
  - `app/futprep/staff/coach/page.tsx` and `CoachRoster.tsx`;
  - `docs/futprep/roles.md` and `app/privacy/page.tsx`.
- **Finding 5:** `db/staff.ts`.
- **Tests:**
  - `db/futprepOrgScope.integration.test.ts`
  - `db/registrationPlaces.integration.test.ts`
  - `db/staffBalances.integration.test.ts`
  - `db/futprepStaffRoles.integration.test.ts` (its coach is now found by Futprep's slug)
  - `lib/futprepRoles.test.ts`
  - `app/api/futprep/staff/registrations/[id]/detail/route.test.ts`
- **Docs:** this report and `docs/ops/STATE.md`.

No migrations. No env var names.

## Tests, failing first then passing
The red runs were each pushed as tests only, before any fix.

| Tests | Red (before the fix) | Green |
| --- | --- | --- |
| #205: `futprepOrgScope` (8 cases), `rosterCsv`, `health.static`, `camps` | Recorded on a local stack before the push; CI was green from the first push (see #205's body) | #205's CI |
| #200: the last place, double taps (9 of 10 failed; the waitlist guard passed) | [run 38185396472](https://github.com/becksthecreator/portpass/actions/runs/38185396472) | #200's CI |
| #203: balances past 1,000 payments (both failed) | [run 38185806506](https://github.com/becksthecreator/portpass/actions/runs/38185806506) | #203's CI |
| #217 round one: coaches today, who coached, the default lead, open times (4 integration); who sees emergency contact and pickup (4 unit) | [run 38193925472](https://github.com/becksthecreator/portpass/actions/runs/38193925472) | [run 38198530909](https://github.com/becksthecreator/portpass/actions/runs/38198530909) (31da60a, with #209, #213, #216 and #222 merged in) |
| #217 round two (from the tdd-guide's list): private session actions and payments, the Team screen, the public coach pages, switching a class, a coach's login link, one child's balance | [run 38195283198](https://github.com/becksthecreator/portpass/actions/runs/38195283198) | [run 38198530909](https://github.com/becksthecreator/portpass/actions/runs/38198530909) (31da60a, with #209, #213, #216 and #222 merged in) |

- **Passed without a fix of ours.** Twenty parents for ten places passed on its first run, because #200 was already on `main`; it is a proof, not a red-first test. In round two, the request list, its numbers and the coach a request goes to passed against `main`, because #209 had merged minutes earlier. Those tests now guard #209's fixes.
- **The save route's test** for the emergency keys was written after its fix. Its unit test, `withoutEmergencyInput`, was red first in round one.
- **The rule after review.** The day-of rule's unit tests changed with it: the medical view always, a coach only on the session's own day, never an admin without the switch or a helper.
- **Futprep (rule 9), brief 27 and brief 29.** These suites run in CI's integration job on every push:
  - Futprep: `db/futprep*`, `registrations`, `camps`, `term2`, `coachPay`, `privateSessions`, `ownerDashboard`, `app/api/futprep/**`;
  - brief 27: `app/api/futprep/registrations/route.integration.test.ts`, `db/camps`, `db/ownerDashboard`;
  - brief 29: `db/privateSessions`.

  They passed on [run 38198530909](https://github.com/becksthecreator/portpass/actions/runs/38198530909) (31da60a, with #209, #213, #216 and #222 merged in) (113 test files on 71565b6, per the reviewer).
- **Screenshots (375px, TEST data):** Artifact `staff-screenshots` of [run 38198530992](https://github.com/becksthecreator/portpass/actions/runs/38198530992) (31da60a): `brief31-registration-no-medical-375.png`, a desk login without the medical view on a child's record, where the Emergency contact panel says it is hidden for that login; `brief31-roster-no-health-375.png`, a coach on a session that is not today, where Safety notes say "shown to coaches on the day of the session, and to the logins Alex has allowed".

## Agent output
- **tdd-guide (before the code):**
  - It listed the tests to write first.
  - It found the gaps the first draft of #217 had missed: private session requests, the Team screen, the public coach pages, the class switch, quick add and login links, plus two oversell paths on the desk and one child's unpaged balance.
  - All of them are covered here, in #209, in #216 or in #220.
- **security-reviewer: "Safe to merge"**, no blockers.
  - **Medium, now moot.** A coach could add themselves under Who coached, see the contacts, then remove the row and leave no trace. Who coached no longer decides this, and every day-of view is logged.
  - **Lows.** Two are fixed: a failed Who-coached read made everyone "on duty" (that test is gone), and `roles.md` contradicted the code (rewritten). The third, recording the coach who marks attendance, is moot under the day-of rule.
  - **Follow-ups.** The private sessions inbox reads every business's private-session payments unpaged, and so does the roster CSV's payments read. Both are listed below.
- **reviewer: three blockers, all fixed.**
  1. Under the first "on duty" rule, the coaches running Lil Kickers and Kickers lost the contacts after the first attendance mark. That mark records the default lead, Coach Bex, who is on an admin login that can't open the roster. Fixed with the day-of rule.
  2. `docs/futprep/roles.md` contradicted the code. Rewritten.
  3. The PR body, this report, STATE.md and the screenshots were missing. Added.

  Its notes:
  - The hint "add yourself" was gone with the rule.
  - Three test-setup writes now fail the test if they fail.
  - The privacy page no longer says the class list carries pickup names.
  - The desk card still flags a missing emergency contact that an admin without the medical view can't fill in. That is for Antonio, below.

## Decisions taken, for Antonio to overrule
1. **The child's record is narrower than before.** An admin without the medical view no longer sees or edits the emergency contact and pickup, which the brief's wording asks for. If the desk needs to phone a parent's emergency contact, or fill in a missing one from a parent's call (the desk card still flags it as missing), the CEO switches that admin's medical view on (Staff accounts).
2. **"The coach on duty for that session's day" means any coach login on the session's own date.** Recording who coached was tried first. It broke the main classes: the automatic default lead is on an admin login, and the coaches on the field lost the pickup list before handover. Every day-of view is logged. If Antonio wants it narrower, the next step is counting the coach who marks attendance; that needs a decision on whether marking also records them for pay.
3. **Removing or restoring a coach who doesn't exist** now answers "That coach is no longer on the team" (404) instead of a silent success.

## Left open (not in this brief)
- **#220:** waitlist promotions, reinstatements and a business's "Confirm the place" under the class's lock.
- **Moving a child to another class** from the record (`updateFutprepRegistrationDetail`) doesn't check that class's cap.
- **`/api/futprep/registrations/lookup`:** the three reference-code lookups behind it have no organisation filter (in STATE.md since #216).
- **Still unpaged:**
  - the roster export's payments and attendance (a long camp can pass 1,000 attendance rows);
  - the private sessions inbox's payments (`listPrivateSessionRequests` reads every business's);
  - `listProgramPnl` payments;
  - session counts on the staff session list.
- **Two ways of finding Futprep:** `app/futprep/staff-auth.ts` uses organisation 1, while the db modules find Futprep by its slug. They agree on production (Futprep is 1), not on CI's fresh database.
