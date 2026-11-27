# Brief 31 follow-up: Team and the registration record fit a phone

Brief 31's `staff-screenshots` run showed three full-page shots wider than 750px (375px at 2x). Both pages had the problem before brief 31. Brief 31 is fixing the coach roster and the operating map itself; they are not part of this.

| Shot | Page | Before | Cause |
| --- | --- | --- | --- |
| `brief16-team-photo-upload-375`, `brief31-team-chips-375` | `/futprep/staff/team` | 794px (397px page) | The staff header's links never wrapped. The CEO's Team header has seven links, so the row ran 22px past the screen. |
| `brief31-registration-no-medical-375` | `/futprep/staff/admin/[id]` | 992px (496px page) | The payment history table has seven columns and was 449px wide inside a 283px panel. |

## The fix
- `app/staff.css`: the staff header's links (`.staff-workspace-header nav`, `.staff-nav-actions`) wrap onto a second row when they don't fit. This header is shared by every Futprep staff page, so it fixes them all at once. At desk width it is still one row.
- `app/staff.css` and `RegistrationDetailEditor.tsx`: up to 700px wide, each payment in the history becomes a block, with every value under its label. This is the same pattern `.admin-table` already uses. Empty cells are left out, and a long reference breaks rather than pushing the page wide. At desk width the table is unchanged.

## How it was checked
- Both pages were rebuilt as static copies with the real CSS and the fixture's TEST data, and measured in Chromium at 375px. They came out 397px and 496px wide, matching CI exactly. After the fix both are 375px, and no element sticks out. At 1440px the header and the table look as before.
- The PR's `staff-screenshots` run is the proof: every shot of these pages should be 750px wide. `scripts/screenshots/capture.mjs` now logs each shot's PNG width (`captured <name>, 750px wide`), so the job log shows it without downloading the artifact.

## Report
- Changed files: `app/staff.css`, `app/futprep/staff/admin/[id]/RegistrationDetailEditor.tsx`, `scripts/screenshots/capture.mjs` (logs each shot's width), `docs/ops/STATE.md`, this report.
- Migrations: none. Env var names: none.
- Futprep (rule 9): CSS and `data-label` attributes only. PIN sign-in, `/futprep/register` and the desk's saving and payments code are untouched. CI runs Futprep's tests.

## For Antonio
1. Nothing to switch. Merge once CI is green and the shots are 750px.
