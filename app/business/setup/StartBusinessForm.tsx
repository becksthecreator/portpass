"use client";

import { FormEvent, useState } from "react";

type SectionOption = { slug: string; name: string; subcategories: { slug: string; name: string }[] };

export function StartBusinessForm({ defaultName, defaultSection, sections }: { defaultName: string; defaultSection: string; sections: SectionOption[] }) {
  const [name, setName] = useState(defaultName);
  const [section, setSection] = useState(sections.some((s) => s.slug === defaultSection) ? defaultSection : "");
  const [subcategory, setSubcategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = sections.find((s) => s.slug === section);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !section) {
      setError("Give your business a name and choose its section.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/business/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), section, subcategory: subcategory || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not start your page.");
      window.location.assign("/business/setup");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start your page.");
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label><span>Business name *</span><input required maxLength={150} autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>
        <span>Section *</span>
        <select required value={section} onChange={(e) => { setSection(e.target.value); setSubcategory(""); }}>
          <option value="">Choose one</option>
          {sections.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </label>
      {current && current.subcategories.length > 0 && (
        <label>
          <span>What kind, more specifically? (optional)</span>
          <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
            <option value="">Choose later</option>
            {current.subcategories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="auth-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Starting…" : "Start my page →"}</button>
      </div>
    </form>
  );
}
