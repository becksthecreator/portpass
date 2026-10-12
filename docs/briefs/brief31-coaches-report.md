# Brief 31: the Futprep coaches back end, report

Five PRs, in order, each rebased on `main`. `reviewer` and `security-reviewer` ran on every one until both passed. The `planner` plan is in PR A. `tdd-guide` ran before C and D, and `qa-runner` ran on C.

| Part | PR | What it is |
| --- | --- | --- |
| A | [#197](https://github.com/becksthecreator/portpass/pull/197) (merged) | One person, one staff login, one role. Duplicates switched off, every coach linked, the medical switch, the owner bridge |
| B | [#212](https://github.com/becksthecreator/portpass/pull/212) (merged) | Where Futprep trains and what each place costs. The P&L estimates field cost, and `/futprep/staff/ops` shows the whole map with a Missing list |
| C | [#209](https://github.com/becksthecreator/portpass/pull/209) (merged) | Each coach's own inbox, days, places and pay. A pay line for every completed private session |
| D | [#213](https://github.com/becksthecreator/portpass/pull/213) (in review) | The Progress Passport: scored on the roster, shared with the family, seen on `/futprep/my/[code]` |
| E | [#214](https://github.com/becksthecreator/portpass/pull/214) (draft) | The proof run: a TEST world walked at 375px, with brief 29's, 27's and 31's suites |

## For Antonio
Nothing below blocks a merge. Each answer is a switch or a row.
1. **Row 10 "Coach Kione"** (coach, no login): is this Kiki? If yes, it is switched off like rows 1 to 3. If not, it's a different coach, who needs a coach profile.
2. **Ronaldo (row 42)** has a login, but it is switched off. Should it be switched back on? (Staff accounts → Reactivate.)
3. **Medical view for admins:** Antonio (39) and Kiki (43) kept theirs. Should Alex switch either off?
4. **Coaches and health notes:** coaches see the emergency contact and pickup on the roster. Health notes show only when Alex switches that coach's medical view on. Which coaches should he switch on?
5. **Adon (row 11)** has no login. He can be given one as admin on Staff accounts when he needs it.
6. **Programs 1 and 2** still have the old place name in their text field, though their place is already 68 "LCIS Lower Campus". Should the text be updated?
7. **Each place's cost** goes in Staff → Locations. Until then, the map lists every place under Missing.
8. **Camps 157 and 159 have no lead coach**, so only the desk can score their passports. Set a lead on Programs. Both term programs (1 and 2) have one (profile 3).
9. **Bex on an admin login:** in the coaching workspace an admin gets the roster without emergency, pickup or health notes, and the roster points to the desk. Coaches see emergency and pickup. Should Antonio's admin login see them on a Saturday too? It is one line to switch (`app/futprep/staff/coach/page.tsx`, the two `admin` checks).

## Decisions taken in the brief (each easy to switch back, said in its PR)
- **C:**
  - "Any coach" requests go to the desk only, and coaches aren't emailed about requests they can't open. This changed one brief 29 test.
  - The 45-minute pair, trio and group sessions, and the 90-minute party, are paid pro rata from the coach's 60-minute rate (else their 30-minute one). With no rate set, the line is $0 and marked "rate not set". It is worked out again when the rate is set, and it never goes into "Mark paid" at $0.
  - The parent's free-text notes reach only logins with the medical view. If that isn't set, nobody sees them.
  - Private-session pay rates are set by the CEO or an admin, but an admin who also coaches can't set their own: the CEO does.
  - A session must be accepted before it is completed, and only on or after its day. A completed session is final. The desk accepts only for an active Futprep coach, never on their day away.
- **D:**
  - Only the class's lead coach (set by the desk on Programs) scores. Being on a session's staff doesn't count, because a coach can add themselves to any session.
  - Clips are links from YouTube or Google Drive, and only with photo permission yes. If permission is withdrawn, the clip is taken down for good.
  - Notes that mention health are refused: "the desk keeps those".
  - The desk can put a mark right at any time. Coaches mark in week 1 and in the last two weeks of term.
  - Term passports only for now: a private-session passport needs a way for the parent to open it, since requests carry no date of birth.
  - Families who registered by the quick form have no date of birth, so they can't use the lookup until the desk adds one.

## Rows switched (hide, never delete)
| Row | Change | Switch back |
| --- | --- | --- |
| `staff_members` 1, 2, 3 (Coach Bex, Kiki, Coach Alex: duplicates with no login) | `active = false`, one `audit_log` line each | `update staff_members set active = true where id in (1, 2, 3);` |
| `staff_members` 46 (Dre), 47 (Ricardo) | new rows: role coach, no login, no PIN, no email | `update staff_members set active = false where id in (46, 47);` |
| `coach_profiles` 4→43, 2→42, 13→46, 127→47 | `staff_member_id` linked (1→40 and 3→39 already were) | `update coach_profiles set staff_member_id = null where id in (2, 4, 13, 127);` |
| `locations` 1 ("Lyford Cay Lower Campus Soccer Field", the same place as 68) | `active = false`, one audit line; no program used it | `update locations set active = true where id = 1;` |

No PIN hash was touched, no sign-in was created and no invite was sent.

## Migrations (all applied to the shared database before their code merged)
| File | What | Switch back |
| --- | --- | --- |
| `202610210001_futprep_staff_roles.sql` | the rows above, roles | as above |
| `202610210002_futprep_owner_grant.sql` | `owner_user_id`, `owner_member_id`; locked functions `futprep_owner_grant`, `futprep_owner_revoke`, `futprep_staff_set_email` (service role only) | drop the functions and the two columns |
| `202610210003_location_costs.sql` | cost, surface, private-session use, days and hours on `locations`. Browsers keep only the seven columns they had | in the file |
| `202610230002_coach_own_inbox.sql` (renumbered from 202610210004 after #200 and #208 merged) | private 30/60 pay rates, `location_id` and `time_to_confirm` on requests, the `private_session_pay` table (lines keep their own reference and date) | in PR C |
| `202610250001_futprep_passports.sql` | `passport_skills` (ten defaults), `passports`, `passport_marks`, `passport_notes`. Triggers: a clip needs photo permission; shared is final; the clip follows photo permission | `drop table public.passport_notes, public.passport_marks, public.passports, public.passport_skills;` |
| `202610250002_passport_shared_is_final_fix.sql` | fixes the shared-is-final trigger on marks. A shared passport's marks and notes can't be deleted or moved, nor its child or band changed | run the function from 0001 again |

Every new table has RLS on, browser roles revoked, a deny-all policy, and a place in `tests/rls.integration.test.ts`. Every function has a fixed search path and EXECUTE for the service role only.

## Env var names
None new.

## Tests
- **The coach can't see others:**
  - `lib/privateSessionAccess.test.ts` (inbox, act, notes);
  - the route tests for `/api/futprep/private-sessions/[id]` and `[id]/payments` (another coach's request answers 404; one referred away answers 403);
  - `db/coachInbox.integration.test.ts` (a coach's list holds only their own requests, the desk's every one; pay lines only their own);
  - `lib/passports/access.test.ts` and the passport route tests (another class answers 403; a helper is refused);
  - `db/opsMap.test.ts` (an admin's map never loads class pay);
  - the walk in E: the coach sees one card, and another coach's request answers 404.
- **New suites:**
  - `lib/futprepRoles.test.ts` (the roles table against `docs/futprep/roles.md`);
  - `db/futprepStaffRoles.integration.test.ts`;
  - `lib/futprepLocations.test.ts`, `lib/coachPay.test.ts`, `lib/opsMissing.test.ts`, `db/coachPay.integration.test.ts`;
  - `lib/workingDays` days away;
  - `db/coachInbox.integration.test.ts`;
  - `lib/passports/rules.test.ts` (bands, mark windows at their edges, scores, health words, clip hosts, share);
  - `db/passports.integration.test.ts` (one passport per child per term, no health field, lead coach only, shared is final in the app and the database, the clip follows permission, the family sees nothing before sharing);
  - `lib/futprepGuards.static.test.ts`: every Futprep staff page and route calls a staff check, except the eight public doors, each listed with its reason.
- **CI on every PR:** `npm audit`, unit, `next build --webpack` (type-checks every file), integration (Futprep's, brief 27's and brief 29's among them).
- **Phase 1 end-to-end run** (booking): green on C's final head (run 38192468598) and on D (run 38192088067).
- **E's walk:** see "The proof run" below.

## Agent output
Each PR carries the full findings and what changed, in its body and comments. In short:

| Part | `reviewer` | `security-reviewer` |
| --- | --- | --- |
| A | three passes; the owner grant needs a founder, and moving the mark takes access away | third pass: **Safe to merge** |
| B | second pass after the admin pay-rate leak, the NOT NULL address and the per-term share were fixed | second pass: **Safe to merge** |
| C | second pass: its one blocker (a flagged word in the staff email) was fixed, and the build is green | second pass and a check of the final change: **Safe to merge** |
| D | second pass: the partial index upsert, the trigger on marks, and the admin's roster saying "no information" were fixed | third pass: **Safe to merge** (its Lows L1 and L3 fixed; L2 a follow-up) |
| E | runs on D's reviewed code; the walk is its own check | the workflow uses only the local stack's keys and a one-run PIN, masked |

`tdd-guide` ran before C and D. The failing-first tests it listed are in each branch (listed in the PR bodies). `qa-runner` ran on C (below).

## Follow-ups (not in this brief)
- The business export includes private-session request notes (`db/businessExport.ts`). It predates brief 31; drop `notes` there (rule 3).
- Recording a parent's private-session payment takes three steps, so a double tap records it twice. It predates brief 31; make it one SQL function with a key.
- The static guard test passes a file that calls a guard anywhere. Check each exported handler.
- Passport note and share have no time window for a coach after the term ends. The desk's override stays.

## The 375px screenshots
The staff screenshot job saves every changed screen for A to D (artifact `staff-screenshots`, files `brief31-*`). The walk saves `e01`…`e11` (artifact `coaches-walk`).

## The proof run (Part E)
`.github/workflows/coaches-walk.yml` on a throwaway local Supabase stack, never the real database. On D's code, the run before the header fix:
- **Suites:** brief 29's, 27's and 31's unit tests (18 files) and integration tests (6 files) all passed.
- **The walk, 9 of 9 steps passed:**
  1. The TEST coach signs in with the PIN form.
  2. Sets Mon, Wed and Fri, and blocks a date.
  3. Sees only their own request (another coach's answers 404) and accepts it.
  4. Completes it: one pay line at the TEST 60-minute rate.
  5. Sees it on Coach pay.
  6. Scores all five skills, start and end, writes a note and a clip link, and shares the passport.
  7. The TEST parent opens it on `/futprep/my/[code]`: the note and clip, no emergency, pickup, health detail or surname.
  8. The TEST owner sees the coach, the place and the class on `/futprep/staff/ops`.
  9. The TEST admin sees every request.
- **375px:** the walk found the coach roster (427px) and the operating map (386px) scrolling sideways. The staff header's links pushed Sign out off the screen; they wrap now (D, `app/staff.css`). The run on the fixed head confirms it.
