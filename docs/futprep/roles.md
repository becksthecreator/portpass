# Futprep staff roles

Who can do what on the Futprep staff screens (`/futprep/staff/…`, staff PIN sign-in). Brief 31, Part A, 11 Oct 2026. The code follows this table; if one changes, change the other in the same PR.

| Role | Who today | Can |
|---|---|---|
| `ceo` (owner) | Alex | Everything: prices, pay rates, locations, team, money, medical view |
| `admin` | Antonio, Adon, Kiki | Registrations, payments, team, locations, schedules (programs, with the fees Alex sets), medical view only if `can_view_medical` |
| `coach` | Ronaldo, Dre, Ricardo (Bex coaches on admin login 39) | Own sessions, own private-session inbox, own days and blocked dates, own pay (read-only), passports for own players, children's health notes on the roster only if `can_view_medical` |
| `helper` | (none yet) | The roster for the session they're on, read-only: names and parent phone, no safety or health notes |

## Where each rule lives

- **Sign-in and role:** `app/futprep/staff-auth.ts` reads `staff_members` (organization 1). One active login per person; a second row for the same person is switched off (`active = false`), never deleted.
- **What a role may open:** each staff page calls `requireFutprepStaff([...roles])`, each API route checks `currentFutprepStaffRole()`. The matrix in `lib/futprepRoles.ts` is the single list, and `lib/futprepRoles.test.ts` checks it against this table.
- **Medical view:** the CEO login always sees a child's allergies, conditions, medications and special needs. An admin login sees them on the registration page, and a coach login on the session roster, only when `staff_members.can_view_medical` is on. Only the CEO login can switch it, every change leaves an audit line, and it is off for every new login, so a login an admin makes can't see them. Without it the registration page hides those fields and a save never changes them, and the roster's health columns are never loaded.
- **Coaches and safety notes:** a coach's session roster shows the emergency contact and authorised pickup for the children in that session (a coach on the field needs them). The health notes appear there only with the switch above; until then the roster says to ask the desk. Helpers see neither. A coach can open any session's roster, not only their own; that is as before brief 31.
- **Programs:** admins and the CEO add programs and switch them on or off (schedules), typing the fees Alex has set. Coaches can read the programs page but not change it. Nothing in code sets a price.
- **Coach pay:** the CEO sees everyone's; any other login sees only its own coach's pay, read-only (`app/futprep/staff/pay/access.ts`).
- **Locations and the operating map:** admins and the CEO set each place's cost, surface, days and whether parents may pick it for a private session (Staff → Locations, `/api/futprep/staff/locations`). Every change is audit-logged, and a place is switched off, never deleted. What a place costs is never readable with a browser key. The operating map (`/futprep/staff/ops`) shows programs, places, private sessions, pay rates and what's missing, to admins and the CEO; it only reads.
- **Owner:** an admin or the CEO marks the CEO's staff login as the owner in Staff accounts; moving a mark that another login already holds is for the CEO login only. That only asks. A PortPass founder (platform owner, with the admin second step) then checks with the person and gives the access in Admin → People: an `org_owner` membership of Futprep, with payments, for the PortPass sign-in with the email the founder saw. If the login's email has changed since the page loaded, the grant is refused. Staff accounts never shows whether an address has a PortPass sign-in. That opens `/business/futprep`. The access is taken back by itself, with an audit line, when the mark moves to another login, the login is switched off, or its email changes (`db/futprepOwner.ts`, with the database functions in migration `202610210002`, each one locked transaction). Only the membership the grant made is ever taken back; one a founder removes or remakes in People is left alone. A staff PIN session alone never makes anyone an owner. PortPass never creates the sign-in or sends an invite.

## People and their logins (11 Oct 2026)

| Person | Staff login kept | Coach profile | Switched off |
|---|---|---|---|
| Alex (Alexander Thompson) | 40 `ceo` | 1 | 3 "Coach Alex" |
| Antonio (Coach Bex) | 39 `admin` | 3 | 1 "Coach Bex" |
| Kiki (Keione Rayside) | 43 `admin` | 4 | 2 "Kiki" |
| Adon | 11 (no login yet) | none | |
| Ronaldo Greene | 42 `coach` (switched off; on again only when Antonio says) | 2 | |
| Dre (Andre Roberts) | 46 (new, no login yet) | 13 | |
| Ricardo McPhee | 47 (new, no login yet) | 127 | |
| "Coach Kione" | 10, left as it is until Antonio says whether this is Kiki | none | |
