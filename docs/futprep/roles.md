# Futprep staff roles

Who can do what on the Futprep staff screens (`/futprep/staff/…`, staff PIN sign-in). Brief 31, Part A, 11 Oct 2026. The code follows this table; if one changes, change the other in the same PR.

| Role | Who today | Can |
|---|---|---|
| `ceo` (owner) | Alex | Everything: prices, pay rates, locations, team, money, medical view |
| `admin` | Antonio, Adon, Kiki | Registrations, payments, team, schedules, medical view only if `can_view_medical` |
| `coach` | Bex, Ronaldo, Dre, Ricardo | Own sessions, own private-session inbox, own days and blocked dates, own pay (read-only), passports for own players |
| `helper` | (none yet) | Roster and attendance for the session they're on |

## Where each rule lives

- **Sign-in and role:** `app/futprep/staff-auth.ts` reads `staff_members` (organization 1). One active login per person; a second row for the same person is switched off (`active = false`), never deleted.
- **What a role may open:** each staff page calls `requireFutprepStaff([...roles])`, each API route checks `currentFutprepStaffRole()`. The matrix in `lib/futprepRoles.ts` is the single list, and `lib/futprepRoles.test.ts` checks it against this table.
- **Medical view:** the CEO login always sees a child's allergies, conditions, medications and special needs on the registration page. An admin login sees them only when `staff_members.can_view_medical` is on; only the CEO login can switch it. Without it the page hides those fields and a save never changes them.
- **Coaches and safety notes:** a coach's session roster shows the allergy and emergency notes for the children in that session (as before brief 31): a coach on the field needs them. Helpers never see them.
- **Programs:** admins and the CEO add programs and switch them on or off (schedules). Coaches can read the programs page but not change it. Prices are typed in as Alex sets them; nothing in code sets a price.
- **Coach pay:** the CEO sees everyone's; any other login sees only its own coach's pay, read-only (`app/futprep/staff/pay/access.ts`).
- **Owner:** one staff login can be marked as the owner in Staff accounts. When that person has a PortPass sign-in with the same email, they get an `org_owner` membership of Futprep (with payments), which opens `/business/futprep`. PortPass never creates the sign-in or sends an invite.

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
