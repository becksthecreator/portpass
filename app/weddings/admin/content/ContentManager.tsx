"use client";

import { useState } from "react";
import type { WeddingSiteSettings } from "@/db/weddingSite";

export function ContentManager({ initialSettings }: { initialSettings: WeddingSiteSettings }) {
  const [reviewCount, setReviewCount] = useState(String(initialSettings.reviewCount));
  const [reviewRecommendPct, setReviewRecommendPct] = useState(String(initialSettings.reviewRecommendPct));
  const [yearsExperience, setYearsExperience] = useState(String(initialSettings.yearsExperience));
  const [awardYears, setAwardYears] = useState(initialSettings.awardYears.join(", "));
  const [reviewsWidgetHtml, setReviewsWidgetHtml] = useState(initialSettings.reviewsWidgetHtml ?? "");
  const [ratingBadgeHtml, setRatingBadgeHtml] = useState(initialSettings.ratingBadgeHtml ?? "");
  const [awardBadgeHtml, setAwardBadgeHtml] = useState(initialSettings.awardBadgeHtml ?? "");
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
        ratingBadgeHtml,
        awardBadgeHtml,
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
      <h2 style={{ marginTop: 24 }}>WeddingWire widgets</h2>
      <p style={{ color: "var(--muted)", fontSize: ".82rem" }}>
        Sign in at WeddingPro.com → Reviews tab to copy each widget's embed HTML, then paste it into the matching field below.
        This is trusted staff-entered content and renders directly on the public page — never paste anything you didn't get from WeddingPro yourself.
      </p>
      <label style={{ display: "block", marginTop: 14, fontSize: ".82rem", fontWeight: 600 }}>Rating badge</label>
      <textarea rows={4} value={ratingBadgeHtml} onChange={(e) => setRatingBadgeHtml(e.target.value)} placeholder="<div>...WeddingWire rating badge embed HTML...</div>" style={{ width: "100%", border: "1px solid var(--line)", padding: 10, fontFamily: "monospace", fontSize: ".78rem" }} />
      <label style={{ display: "block", marginTop: 14, fontSize: ".82rem", fontWeight: 600 }}>Couples&rsquo; Choice Award badge</label>
      <textarea rows={4} value={awardBadgeHtml} onChange={(e) => setAwardBadgeHtml(e.target.value)} placeholder="<div>...WeddingWire award badge embed HTML...</div>" style={{ width: "100%", border: "1px solid var(--line)", padding: 10, fontFamily: "monospace", fontSize: ".78rem" }} />
      <label style={{ display: "block", marginTop: 14, fontSize: ".82rem", fontWeight: 600 }}>Reviews widget</label>
      <textarea rows={4} value={reviewsWidgetHtml} onChange={(e) => setReviewsWidgetHtml(e.target.value)} placeholder="<div>...WeddingWire reviews widget embed HTML...</div>" style={{ width: "100%", border: "1px solid var(--line)", padding: 10, fontFamily: "monospace", fontSize: ".78rem" }} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="staff-actions">
        <button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {saved && !error && <span className="coach-manager-message">Saved ✓</span>}
      </div>
    </div>
  );
}
