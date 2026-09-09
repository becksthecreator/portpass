"use client";
import { FormEvent, useState } from "react";

type StaffAccount = { id: number; name: string; accountKey: string; role: "admin" | "coach" | "ceo" | "helper"; active: boolean };

const ROLE_LABEL: Record<StaffAccount["role"], string> = {
  admin: "Admin",
  coach: "Coach",
  ceo: "CEO",
  helper: "Helper",
};

export function AccountsManager({ initialAccounts, currentAccountKey }: { initialAccounts: StaffAccount[]; currentAccountKey: string }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleActive(account: StaffAccount) {
    setError("");
    const response = await fetch("/api/futprep/staff/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, active: !account.active }),
    });
    const data = (await response.json()) as { accounts?: StaffAccount[]; error?: string };
    if (!response.ok) return setError(data.error ?? "Could not update the account.");
    if (data.accounts) setAccounts(data.accounts);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/futprep/staff/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          accountKey: form.get("accountKey"),
          role: form.get("role"),
          pin: form.get("pin"),
        }),
      });
      const data = (await response.json()) as { accounts?: StaffAccount[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not create the account.");
      if (data.accounts) setAccounts(data.accounts);
      setMessage("Account created — share the account name and PIN with them directly. They can change the PIN once signed in.");
      event.currentTarget.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="team-manager">
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="coach-manager-message">{message}</p>}

      <div className="team-manager-grid">
        {accounts.map((account) => (
          <article className="team-manager-card" key={account.id}>
            <div>
              <span>{ROLE_LABEL[account.role]}</span>
              <h2>{account.name}</h2>
              <p>Account name: {account.accountKey}</p>
            </div>
            <div className="team-manager-flags">
              <span className={account.active ? "flag-on" : "flag-off"}>{account.active ? "Active" : "Deactivated"}</span>
            </div>
            <div className="team-manager-actions">
              <button
                className={account.active ? "danger-action" : ""}
                disabled={account.accountKey === currentAccountKey}
                title={account.accountKey === currentAccountKey ? "You can't deactivate your own account" : undefined}
                onClick={() => toggleActive(account)}
              >
                {account.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="team-admin-panels">
        <form className="team-admin-form" onSubmit={create}>
          <span className="section-kicker">New account</span>
          <h2>Add a staff account.</h2>
          <div className="team-form-two">
            <label><span>Name</span><input name="name" placeholder="Coach Alex" required /></label>
            <label><span>Account name</span><input name="accountKey" placeholder="lowercase, no spaces" pattern="[a-z0-9_-]{3,40}" required /></label>
          </div>
          <div className="team-form-two">
            <label><span>Role</span>
              <select name="role" required defaultValue="coach">
                <option value="admin">Admin — registration desk, programs, team, accounts</option>
                <option value="coach">Coach — coaching workspace, programs</option>
                <option value="ceo">CEO — everything</option>
                <option value="helper">Helper — view roster & session plan only</option>
              </select>
            </label>
            <label><span>Starting PIN</span><input name="pin" inputMode="numeric" placeholder="4+ digits" pattern="\d{4,}" required /></label>
          </div>
          <button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create account →"}</button>
        </form>
      </div>
    </div>
  );
}
