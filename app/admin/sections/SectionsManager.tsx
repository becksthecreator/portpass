"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export type SectionRow = { id: number; slug: string; name: string; isVisible: boolean; comingSoonThreshold: number; live: number; subsections: { id: number; slug: string; name: string; isVisible: boolean; comingSoonThreshold: number; live: number }[] };

// Add, rename, reorder and hide sections and subsections, and set the
// coming-soon threshold. Every change goes through /api/admin/sections,
// which audit-logs it and revalidates the site, then this screen refreshes.
export function SectionsManager({ sections }: { sections: SectionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newSection, setNewSection] = useState("");
  const [newSub, setNewSub] = useState<Record<number, string>>({});
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "That didn't save.");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addSection(event: FormEvent) {
    event.preventDefault();
    if (await call("/api/admin/sections", "POST", { name: newSection, parentId: null })) setNewSection("");
  }

  async function addSub(event: FormEvent, sectionId: number) {
    event.preventDefault();
    if (await call("/api/admin/sections", "POST", { name: newSub[sectionId] ?? "", parentId: sectionId })) setNewSub((s) => ({ ...s, [sectionId]: "" }));
  }

  async function saveRename() {
    if (!renaming) return;
    if (await call(`/api/admin/sections/${renaming.id}`, "PATCH", { name: renaming.name })) setRenaming(null);
  }

  const Row = ({ item, isSection }: { item: SectionRow | SectionRow["subsections"][number]; isSection: boolean }) => (
    <>
      {renaming?.id === item.id ? (
        <span className="admin-section-row" style={{ flex: "1 1 200px" }}>
          <input className="admin-inline-input" style={{ width: 220 }} value={renaming.name} onChange={(e) => setRenaming({ id: item.id, name: e.target.value })} autoFocus />
          <button className="admin-mini is-primary" type="button" disabled={busy} onClick={() => void saveRename()}>Save</button>
          <button className="admin-mini" type="button" onClick={() => setRenaming(null)}>Cancel</button>
        </span>
      ) : (
        <>
          {isSection ? <strong>{item.name}</strong> : <span className="name">{item.name}</span>}
          <small style={{ color: "var(--muted)" }}>/{item.slug} · {item.live} live</small>
        </>
      )}
      <button className="admin-mini" type="button" disabled={busy} onClick={() => setRenaming({ id: item.id, name: item.name })}>Rename</button>
      <button className="admin-mini" type="button" disabled={busy} aria-label="Move up" onClick={() => void call(`/api/admin/sections/${item.id}`, "PATCH", { move: "up" })}>↑</button>
      <button className="admin-mini" type="button" disabled={busy} aria-label="Move down" onClick={() => void call(`/api/admin/sections/${item.id}`, "PATCH", { move: "down" })}>↓</button>
      <button className="admin-mini" type="button" disabled={busy} onClick={() => void call(`/api/admin/sections/${item.id}`, "PATCH", { isVisible: !item.isVisible })}>{item.isVisible ? "Hide" : "Show"}</button>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: ".72rem", color: "var(--muted)" }}>
        Soon below
        <input className="admin-inline-input" type="number" min={0} max={50} defaultValue={item.comingSoonThreshold} disabled={busy} onBlur={(e) => { const v = Number(e.target.value); if (v !== item.comingSoonThreshold) void call(`/api/admin/sections/${item.id}`, "PATCH", { comingSoonThreshold: v }); }} />
      </label>
    </>
  );

  return (
    <div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form className="admin-form" onSubmit={addSection}>
        <div className="admin-form-row">
          <label>New section<input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="e.g. Wellness" maxLength={60} required /></label>
          <button className="primary-button" type="submit" disabled={busy}>Add section</button>
        </div>
      </form>
      {sections.map((section) => (
        <article key={section.id} className="admin-section-card">
          <div className={`admin-section-row${section.isVisible ? "" : " is-hidden"}`}>
            <Row item={section} isSection />
          </div>
          <ul className="admin-subs">
            {section.subsections.map((sub) => (
              <li key={sub.id} className={sub.isVisible ? "" : "is-hidden"}>
                <Row item={sub} isSection={false} />
              </li>
            ))}
            <li>
              <form className="admin-form-row" onSubmit={(e) => void addSub(e, section.id)} style={{ flex: 1 }}>
                <input className="admin-inline-input" style={{ width: 200 }} value={newSub[section.id] ?? ""} onChange={(e) => setNewSub((s) => ({ ...s, [section.id]: e.target.value }))} placeholder={`New subsection in ${section.name}`} maxLength={60} required />
                <button className="admin-mini is-primary" type="submit" disabled={busy}>Add</button>
              </form>
            </li>
          </ul>
        </article>
      ))}
    </div>
  );
}
