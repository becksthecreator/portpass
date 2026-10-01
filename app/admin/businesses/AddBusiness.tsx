"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type SectionOption = { slug: string; name: string; subcategories: Array<{ slug: string; name: string }> };

// "Add a business" (brief 08, 1.2): a founder starts the page for an
// owner. It opens in the same setup wizard an owner uses; nothing is
// public until it is published or claimed and approved.
export function AddBusiness({ sections }: { sections: SectionOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), section: form.get("section"), subcategory: form.get("subcategory") || null }),
    }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string; slug?: string | null }) : {};
    if (!response || !response.ok || !data.slug) {
      setBusy(false);
      setError(data.error ?? "Could not add the business.");
      return;
    }
    router.push(`/business/${data.slug}/settings`);
  }

  if (!open) return <button type="button" className="primary-button" onClick={() => setOpen(true)}>Add a business</button>;

  const subsections = sections.find((s) => s.slug === section)?.subcategories ?? [];
  return (
    <form className="admin-form admin-add-business" onSubmit={submit}>
      <h2>Add a business</h2>
      <p className="admin-form-note">Starts an unpublished draft and opens the setup steps. Publish it when the owner agrees, or send them a claim link.</p>
      <label><span>Business name</span><input name="name" required minLength={2} maxLength={120} autoComplete="off" /></label>
      <div className="admin-form-row">
        <label><span>Section</span>
          <select name="section" required value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">Choose…</option>
            {sections.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </label>
        <label><span>Subsection</span>
          <select name="subcategory" defaultValue="" disabled={subsections.length === 0}>
            <option value="">—</option>
            {subsections.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="admin-form-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Adding…" : "Add and open setup →"}</button>
        <button className="admin-bar-link" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
