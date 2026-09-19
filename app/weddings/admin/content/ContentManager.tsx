"use client";

import { useState } from "react";
import type { WeddingSiteSettings } from "@/db/weddingSite";

export function ContentManager({ initialSettings }: { initialSettings: WeddingSiteSettings }) {
  const [reviewCount, setReviewCount] = useState(String(initialSettings.reviewCount));
  const [reviewRecommendPct, setReviewRecommendPct] = useState(String(initialSettings.reviewRecommendPct));
  const [yearsExperience, setYearsExperience] = useState(String(initialSettings.yearsExperience));
  const [awardYears, setAwardYears] = useState(initialSettings.awardYears.join(", "));
  const [reviewsWidgetHtml, setReviewsWidgetHtml] = useState(initialSettings.reviewsWidgetHtml ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    const response = await fetch("/api/weddings/admin/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewCount: Number(reviewCount),
        reviewRecommendPct: Number(reviewRecommendPct),
        yearsExperience: Number(yearsExperience),
        awardYears,
        reviewsWidgetHtml,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(data.error ?? "Could not save."); return; }
    setSaved(true);
  }

  return (
    <div className="wedding-admin-panel">
      <h2>Trust strip</h2>
      <div className="wedding-admin-field-grid">
        <label><span>Review count</span><input inputMode="numeric" value={reviewCount} onChange={(e) => setReviewCount(e.target.value)} /></label>
        <label><span>Recommended % of couples</span><input inputMode="numeric" value={reviewRecommendPct} onChange={(e) => setReviewRecommendPct(e.target.value)} /></label>
        <label><span>Years of experience</span><input inputMode="numeric" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} /></label>
        <label><span>Couples' Choice award years (comma-separated)</span><input value={awardYears} onChange={(e) => setAwardYears(e.target.value)} placeholder="2019, 2020, 2021, 2022, 2023, 2026" /></label>
      </div>
      <h2 style={{ marginTop: 24 }}>WeddingWire reviews widget</h2>
      <p style={{ color: "var(--muted)", fontSize: ".82rem" }}>
        Sign in at WeddingPro.com → Reviews tab → Reviews Widget → choose a colour scheme → copy the HTML → paste it below.
        This is trusted staff-entered content and renders directly on the public page — never paste anything you didn't get from WeddingPro yourself.
      </p>
      <textarea rows={6} value={reviewsWidgetHtml} onChange={(e) => setReviewsWidgetHtml(e.target.value)} placeholder="<div>...WeddingWire embed HTML...</div>" style={{ width: "100%", border: "1px solid var(--line)", padding: 10, fontFamily: "monospace", fontSize: ".78rem" }} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="staff-actions">
        <button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {saved && !error && <span className="coach-manager-message">Saved ✓</span>}
      </div>
    </div>
  );
}
