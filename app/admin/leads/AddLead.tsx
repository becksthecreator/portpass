"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type SectionOption = { slug: string; name: string; subcategories: Array<{ slug: string; name: string }> };

// Add one business by hand: after a conversation, or a referral from a
// business that is already live. Only what the business publishes about
// itself goes in these boxes.
export function AddLead({ sections }: { sections: SectionOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState("");
  const [source, setSource] = useState("founder");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: form.get("businessName"),
        section: form.get("section") || null,
        subsection: form.get("subsection") || null,
        area: form.get("area"),
        island: form.get("island"),
        whatTheyDo: form.get("whatTheyDo"),
        instagramHandle: form.get("instagramHandle"),
        phone: form.get("phone"),
        websiteUrl: form.get("websiteUrl"),
        notes: form.get("notes"),
        source,
        referralCode: form.get("referralCode"),
        warmConnection: form.get("warmConnection") === "on",
      }),
    }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string; lead?: { id: number }; leadId?: number | null }) : {};
    setBusy(false);
    if (!response || !response.ok || !data.lead) {
      setError(data.error ?? "Could not add that lead.");
      return;
    }
    router.push(`/admin/leads/${data.lead.id}`);
  }

  if (!open) {
    return <button type="button" className="primary-button leads-add-toggle" onClick={() => setOpen(true)}>Add a lead</button>;
  }
  const subsections = sections.find((s) => s.slug === section)?.subcategories ?? [];
  return (
    <form className="admin-form leads-add" onSubmit={submit}>
      <h2>Add a lead</h2>
      <p className="leads-add-note">Only what the business publishes about itself. No personal numbers, nothing from a private chat.</p>
      <div className="admin-form-row">
        <label><span>Business name *</span><input name="businessName" required maxLength={160} /></label>
        <label><span>How we heard</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="founder">A founder added it</option>
            <option value="referral">Referred by a live business</option>
          </select>
        </label>
      </div>
      {source === "referral" && <label><span>Referral code or who referred them *</span><input name="referralCode" maxLength={40} required /></label>}
      <div className="admin-form-row">
        <label><span>Section</span>
          <select name="section" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">Not sure yet</option>
            {sections.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </label>
        <label><span>Subsection</span>
          <select name="subsection" disabled={subsections.length === 0} defaultValue="">
            <option value="">—</option>
            {subsections.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <div className="admin-form-row">
        <label><span>Area</span><input name="area" maxLength={80} placeholder="Cable Beach" /></label>
        <label><span>Island</span><input name="island" maxLength={80} placeholder="New Providence" /></label>
      </div>
      <label><span>What they do</span><input name="whatTheyDo" maxLength={600} /></label>
      <div className="admin-form-row">
        <label><span>Instagram handle</span><input name="instagramHandle" maxLength={200} placeholder="@theirbusiness" autoCapitalize="none" /></label>
        <label><span>Business phone or WhatsApp</span><input name="phone" maxLength={60} inputMode="tel" /></label>
      </div>
      <label><span>Website</span><input name="websiteUrl" maxLength={300} inputMode="url" autoCapitalize="none" /></label>
      <label><span>Notes</span><textarea name="notes" rows={2} maxLength={2000} /></label>
      <label className="leads-check"><input type="checkbox" name="warmConnection" /> <span>Warm connection (someone we already know)</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="leads-add-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Adding…" : "Add lead"}</button>
        <button type="button" className="admin-bar-link" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
