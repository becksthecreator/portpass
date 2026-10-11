# Brief 27 (v2): Futprep reset — report

Four PRs, in order, each rebased on `main`, each reviewed by `reviewer` and `security-reviewer`, with the `planner` plan in PR A.

| Part | PR | What it is |
| --- | --- | --- |
| A | [#191](https://github.com/becksthecreator/portpass/pull/191) (merged) | Take down what we can't promise: camps empty state, "Term 2 opens…" line, staff desk lists closed terms, staff note on the Christmas camp, Term 1 closed to new families, Term 2 switched on |
| B | [#192](https://github.com/becksthecreator/portpass/pull/192) | The owner's money and attendance on one screen, on `/business/<slug>` |
| C | [#193](https://github.com/becksthecreator/portpass/pull/193) | Booking in three taps at `/futprep/register`; private sessions read the same way |
| D | [#194](https://github.com/becksthecreator/portpass/pull/194) | Flamingo Night: eight tokens on Futprep's row, every Futprep page and email, AA checked by a unit test |

## Decisions taken with Antonio during the brief
- Futprep focuses on **Term 2** of Lil Kickers and Kickers and the **Christmas camp**; there is no mid-term camp.
- **Term 1 is closed to new families.** Families already in Term 1 are untouched; staff can still add a late joiner from the desk.

## Rows switched (hide, never delete)
| Row | Change | Switch back |
| --- | --- | --- |
| `program_terms` 1, 2 (Term 1) | `registration_closes_at = now()` (11 Oct, audit_log) | `update program_terms set registration_closes_at = null where id in (1,2)` |
| `program_terms` 158, 159 (Term 2) | `active = true`; opens to parents 19 Nov 05:00 UTC as already set | `update program_terms set active = false where id in (158,159)` |
| `programs` 157 (October camp) | already `is_public = false` (audit 61); left so | `update programs set is_public = true where id = 157` |
| `programs` 159 (Christmas camp) | `staff_note = 'Confirm with Alex before 2 Nov.'` (migration 202610190005) | `update programs set staff_note = null where id = 159` |
| `organizations` futprep | `theme.tokens` (202610190006); `brand_color = #FF4A86`, `theme.background = #0F1B2D` (202610190007; was `#124055`, no background) | `brand_color = '#124055'`; remove `tokens` and `background` from `theme` |

## Migrations
`202610190005_program_staff_note.sql`, `202610190006_futprep_flamingo_night_theme.sql`, `202610190007_futprep_brand_flamingo.sql`. Theme, brand and one staff-note column; all applied to the shared database before merge.

## Env var names
None new.

## Tests run
CI on every PR (`npm audit`, unit, `next build --webpack` type-check, integration, Futprep's and brief 29's suites). New: `db/camps.integration.test.ts` (staff desk, next opening), `lib/ownerDashboard.test.ts` + `db/ownerDashboard.integration.test.ts`, `lib/quickRegistration.test.ts` + five quick-mode cases in `app/api/futprep/registrations/route.integration.test.ts`, `lib/futprepTheme.test.ts` (every text pair ≥ 4.5:1, white never on pink), `lib/futprepEmail.test.ts`. Phase 1 end-to-end run on branch C: RUN_PHASE1.

## Agent output
In each PR body under "Agent output". Everything the reviewers marked medium or above was fixed before merge; the lows were applied too, except the three noted as designed (years-only ages are read as "turned N this month"; the classic form still prints the hard-coded bank account; the CEO money strip stays until desk payments and payment requests meet).

## Lighthouse (mobile, Futprep home)
LIGHTHOUSE_RESULT

## Screenshots (375px)
- Part A: `/futprep/camps` and `/futprep/register` on production after the deploy (SHOTS_A).
- Part B: `brief27-dashboard-*` in the staff-screenshots run on `main` after #192 (SHOTS_B).
- Part C: staff-screenshots run 38098181282: `brief27-before-1…5` (the classic walk), `brief27-after-1-pick`, `-2-who`, `-3-done`, `-book-private`.
- Part D: before = the Part C run (old pink and teal) and the production coaches page this morning; after = staff-screenshots run 38099322439 (`brief27-palette-home`, `-coaches`, `-camps`, `brief27-after-*`).

## For Antonio
1. **Nobody can open `/business/futprep` yet**: `organization_members` is empty. Sign in with the account that should own Futprep, then Admin → People → make it the owner. The dashboard, the CSVs and the "Money & attendance" link on the CEO page all wait on that.
2. Term 2's 24 sessions start **12 Dec** (taster date) although the term starts 9 Jan. After 19 Nov the home page will advertise a free taster on 12 Dec; clear `taster_date` on terms 158 and 159 if Alex hasn't confirmed it.
3. The Saturday pages still say "Term dates September 5 – December 5, 2026" from `offerings` 1 and 2; update to Term 2's dates when Term 1 ends.
4. The register page's "opens on" line names the Christmas camp (2 Nov) because it opens before Term 2 (19 Nov); both are in the data as set.
5. Futprep's registration money from Term 1 sits on the desk as payments on registrations, not as payment requests, so "Collected this month" on the dashboard counts requests only.
6. Emails to coaches and owners still skip: no Futprep staff login has an email (brief 29 note).
