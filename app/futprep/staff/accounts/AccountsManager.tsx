"use client";
import { FormEvent, useState } from "react";
import { missingForLogin } from "@/lib/futprepRoles";

type StaffAccount = { id: number; name: string; accountKey: string; role: "admin" | "coach" | "ceo" | "helper"; active: boolean; pinChangedAt: string | null; email: string | null; canViewMedical: boolean; isOwner: boolean };
type WithoutLogin = { id: number; name: string; role: string; email: string | null };
type Everyone = { accounts?: StaffAccount[]; withoutLogin?: WithoutLogin[]; error?: string };

const ROLE_LABEL: Record<StaffAccount["role"], string> = {
  admin: "Admin",
  coach: "Coach",
  ceo: "CEO",
  helper: "Helper",
};

const OWNER_STEP: Record<"granted" | "needs_email" | "needs_sign_in", (name: string, email: string | null) => string> = {
  granted: (name) => `${name} is Futprep's owner on PortPass now. /business/futprep opens for them when they sign in.`,
  needs_email: (name) => `${name} is marked as the owner. Add their email above, then press the button again.`,
  needs_sign_in: (name, email) => `${name} is marked as the owner. Ask them to sign in once at portpassbahamas.com/login with ${email}, then press the button again. PortPass doesn't make the sign-in or send an invite.`,
};

// canManageCeo: only the CEO login may create a CEO login or switch one
// off or on (the server enforces it; this just hides what would be refused).
// canSetMedical: only the CEO switches an admin login's medical view.
export function AccountsManager({ initialAccounts, initialWithoutLogin, currentAccountKey, canManageCeo, canSetMedical }: { initialAccounts: StaffAccount[]; initialWithoutLogin: WithoutLogin[]; currentAccountKey: string; canManageCeo: boolean; canSetMedical: boolean }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [withoutLogin, setWithoutLogin] = useState(initialWithoutLogin);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function apply(data: Everyone) {
    if (data.accounts) setAccounts(data.accounts);
    if (data.withoutLogin) setWithoutLogin(data.withoutLogin);
  }

  async function send(method: "POST" | "PATCH", path: string, payload: Record<string, unknown>): Promise<(Everyone & Record<string, unknown>) | null> {
    setError("");
    setMessage("");
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as Everyone & Record<string, unknown>) : { error: "No connection. Try again." };
    if (!response || !response.ok) {
      setError(data.error ?? "Could not save.");
      return null;
    }
    apply(data);
    return data;
  }

  async function toggleActive(account: StaffAccount) {
    await send("PATCH", "/api/futprep/staff/accounts", { id: account.id, active: !account.active });
  }

  // Where this person's reminders and private-session requests are emailed.
  async function saveEmail(event: FormEvent<HTMLFormElement>, account: StaffAccount) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    if (await send("PATCH", "/api/futprep/staff/accounts", { id: account.id, email })) setMessage(`Email saved for ${account.name}.`);
  }

  async function setMedical(account: StaffAccount, value: boolean) {
    if (await send("PATCH", "/api/futprep/staff/accounts", { id: account.id, canViewMedical: value })) {
      setMessage(value ? `${account.name} can see children's medical details now.` : `${account.name} no longer sees children's medical details.`);
    }
  }

  async function markOwner(account: StaffAccount) {
    const data = await send("POST", "/api/futprep/staff/accounts/owner", { id: account.id });
    if (!data) return;
    const state = data.state as keyof typeof OWNER_STEP;
    setMessage(OWNER_STEP[state]?.(String(data.name ?? account.name), (data.email as string | null) ?? null) ?? "Saved.");
  }

  async function giveLogin(event: FormEvent<HTMLFormElement>, person: WithoutLogin) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    const data = await send("POST", "/api/futprep/staff/accounts", { action: "login", id: person.id, accountKey: form.get("accountKey"), role: form.get("role"), pin: form.get("pin") });
    setBusy(false);
    if (data) {
      setMessage(`${person.name} has a login now. Tell them the account name and PIN in person; they change the PIN after signing in.`);
      formEl.reset();
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    const data = await send("POST", "/api/futprep/staff/accounts", { name: form.get("name"), accountKey: form.get("accountKey"), role: form.get("role"), pin: form.get("pin") });
    setBusy(false);
    if (data) {
      setMessage("Account created. Share the account name and PIN with them directly. They can change the PIN once signed in.");
      formEl.reset();
    }
  }

  const coachRoles = (role: string) => role === "coach" || role === "helper" || role === "admin" ? role : "coach";

  return (
    <div className="team-manager">
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="coach-manager-message" role="status">{message}</p>}

      <div className="team-manager-grid">
        {accounts.map((account) => {
          const missing = missingForLogin({ linked: true, hasEmail: Boolean(account.email), hasPin: true, active: account.active });
          const ceoLocked = account.role === "ceo" && !canManageCeo;
          return (
            <article className="team-manager-card" key={account.id}>
              <div>
                <span>{ROLE_LABEL[account.role]}{account.isOwner ? " · Owner" : ""}</span>
                <h2>{account.name}</h2>
                <p>Account name: {account.accountKey}</p>
              </div>
              <div className="team-manager-flags">
                <span className={account.active ? "flag-on" : "flag-off"}>{account.active ? "Active" : "Deactivated"}</span>
                <span className={account.pinChangedAt ? "flag-on" : "flag-off"} title={account.pinChangedAt ? `Changed ${new Date(account.pinChangedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "Still on the PIN an admin set"}>
                  {account.pinChangedAt ? "PIN changed ✓" : "PIN not changed yet"}
                </span>
                {missing.filter((m) => m !== "Login switched off").map((m) => <span key={m} className="flag-missing">{m}</span>)}
                {account.role === "admin" && <span className={account.canViewMedical ? "flag-on" : "flag-off"}>{account.canViewMedical ? "Sees medical" : "No medical view"}</span>}
              </div>
              <form className="team-manager-email" onSubmit={(event) => saveEmail(event, account)}>
                <label><span>Email</span><input name="email" type="email" inputMode="email" autoCapitalize="none" maxLength={254} defaultValue={account.email ?? ""} placeholder="for reminders and requests" disabled={ceoLocked} /></label>
                <button type="submit" disabled={ceoLocked}>Save</button>
              </form>
              {account.role === "admin" && canSetMedical && (
                <label className="team-manager-switch">
                  <input type="checkbox" checked={account.canViewMedical} onChange={(event) => setMedical(account, event.target.checked)} />
                  <span>Can see children&rsquo;s medical details</span>
                </label>
              )}
              <div className="team-manager-actions">
                <button
                  className={account.active ? "danger-action" : ""}
                  disabled={account.accountKey === currentAccountKey || ceoLocked}
                  title={account.accountKey === currentAccountKey ? "You can't deactivate your own account" : ceoLocked ? "Only the CEO login can change a CEO login" : undefined}
                  onClick={() => toggleActive(account)}
                >
                  {account.active ? "Deactivate" : "Reactivate"}
                </button>
                {account.role === "ceo" && account.active && (
                  <button type="button" onClick={() => markOwner(account)}>{account.isOwner ? "Give owner access again" : "Mark as the owner"}</button>
                )}
              </div>
              {account.role === "ceo" && account.active && (
                <p className="team-manager-hint">The owner gets Futprep&rsquo;s owner dashboard on PortPass (/business/futprep) once they sign in to PortPass with the email above. PortPass doesn&rsquo;t make the sign-in or send an invite.</p>
              )}
            </article>
          );
        })}
      </div>

      {withoutLogin.length > 0 && (
        <section className="team-without-login" aria-labelledby="without-login-title">
          <span className="section-kicker">On the team, no login yet</span>
          <h2 id="without-login-title">Give a login.</h2>
          <p className="team-manager-hint">Give the person a login here rather than adding a new account, so each person keeps one row. Tell them the account name and the starting PIN in person; they change the PIN after their first sign-in.</p>
          <div className="team-manager-grid">
            {withoutLogin.map((person) => (
              <article className="team-manager-card" key={person.id}>
                <div><span>{person.role in ROLE_LABEL ? ROLE_LABEL[person.role as StaffAccount["role"]] : "Staff"}</span><h2>{person.name}</h2></div>
                <div className="team-manager-flags">
                  <span className="flag-missing">No PIN yet</span>
                  {!person.email && <span className="flag-missing">No email</span>}
                </div>
                <form className="team-login-form" onSubmit={(event) => giveLogin(event, person)}>
                  <label><span>Account name</span><input name="accountKey" placeholder="lowercase, no spaces" pattern="[a-z0-9_-]{3,40}" autoCapitalize="none" required /></label>
                  <label><span>Role</span>
                    <select name="role" defaultValue={coachRoles(person.role)}>
                      <option value="admin">Admin</option>
                      <option value="coach">Coach</option>
                      {canManageCeo && <option value="ceo">CEO</option>}
                      <option value="helper">Helper</option>
                    </select>
                  </label>
                  <label><span>Starting PIN</span><input name="pin" inputMode="numeric" placeholder="6+ digits" pattern="\d{6,}" required /></label>
                  <button type="submit" disabled={busy}>Give login</button>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="team-admin-panels">
        <form className="team-admin-form" onSubmit={create}>
          <span className="section-kicker">New account</span>
          <h2>Add a staff account.</h2>
          <p className="team-manager-hint">For someone not on the team yet. If they&rsquo;re listed above, give them a login there instead.</p>
          <div className="team-form-two">
            <label><span>Name</span><input name="name" placeholder="Coach Alex" required /></label>
            <label><span>Account name</span><input name="accountKey" placeholder="lowercase, no spaces" pattern="[a-z0-9_-]{3,40}" required /></label>
          </div>
          <div className="team-form-two">
            <label><span>Role</span>
              <select name="role" required defaultValue="coach">
                <option value="admin">Admin: registrations, payments, team, schedules</option>
                <option value="coach">Coach: own sessions, inbox, days and pay</option>
                {canManageCeo && <option value="ceo">CEO: everything</option>}
                <option value="helper">Helper: roster and attendance</option>
              </select>
            </label>
            <label><span>Starting PIN</span><input name="pin" inputMode="numeric" placeholder="6+ digits, they change it after first sign-in" pattern="\d{6,}" required /></label>
          </div>
          <button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create account →"}</button>
        </form>
      </div>
    </div>
  );
}
