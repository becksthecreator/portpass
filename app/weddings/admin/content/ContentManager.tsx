"use client";

import { useState } from "react";
import type { WeddingSiteSettings } from "@/db/weddingSite";
import { isWeddingWireMemberId } from "@/lib/weddingWire";

const WHOLE_NUMBER = /^\d{1,6}$/;
const YEAR = /^\d{4}$/;

export function ContentManager({ initialSettings }: { initialSettings: WeddingSiteSettings }) {
  const [reviewCount, setReviewCount] = useState(String(initialSettings.reviewCount));
  const [reviewRecommendPct, setReviewRecommendPct] = useState(String(initialSettings.reviewRecommendPct));
  const [yearsExperience, setYearsExperience] = useState(String(initialSettings.yearsExperience));
  const [awardYears, setAwardYears] = useState(initialSettings.awardYears.join(", "));
  const [memberId, setMemberId] = useState(initialSettings.weddingWire.memberId ?? "");
  const [showRatingBadge, setShowRatingBadge] = useState(initialSettings.weddingWire.ratingBadge);
  const [showAwardBadge, setShowAwardBadge] = useState(initialSettings.weddingWire.awardBadge);
  const [showReviews, setShowReviews] = useState(initialSettings.weddingWire.reviews);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // The same rules the server applies (lib/weddingSiteContent.ts), said in
  // words before anything is sent.
  function problem(): string | null {
    if (![reviewCount, reviewRecommendPct, yearsExperience].every((value) => WHOLE_NUMBER.test(value.trim()))) return "Enter whole numbers for the review count, the recommended % and the years.";
    if (Number(reviewCount) > 100_000) return "The review count can't be more than 100,000.";
    if (Number(reviewRecommendPct) > 100) return "The recommended % can't be more than 100.";
    if (Number(yearsExperience) > 150) return "The years of experience can't be more than 150.";
    const years = awardYears.split(",").map((year) => year.trim()).filter(Boolean);
    if (years.length > 30 || !years.every((year) => YEAR.test(year) && Number(year) >= 2000 && Number(year) <= 2100)) return "Enter the award years as four-digit years, separated by commas.";
    const id = memberId.trim();
    if (id && !isWeddingWireMemberId(id)) return "The WeddingWire member ID is digits only: the number in WeddingPro's embed code.";
    if (!id && (showRatingBadge || showAwardBadge || showReviews)) return "Enter the WeddingWire member ID to show its badges or reviews.";
    return null;
  }

  async function save() {
    setError("");
    setSaved(false);
    const found = problem();
    if (found) { setError(found); return; }
    setBusy(true);
    const response = await fetch("/api/weddings/admin/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewCount: Number(reviewCount.trim()),
        reviewRecommendPct: Number(reviewRecommendPct.trim()),
        yearsExperience: Number(yearsExperience.trim()),
        awardYears: awardYears.split(",").map((year) => year.trim()).filter(Boolean).map(Number),
        weddingWireMemberId: memberId.trim(),
        showRatingBadge,
        showAwardBadge,
        showReviews,
      }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) { setError(data.error ?? "Could not save."); return; }
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
        PortPass builds the rating badge, the award badge and the reviews from your WeddingWire member ID, so there is no code to paste.
        The member ID is the number in brackets at the end of each embed code on WeddingPro.com → Reviews tab.
      </p>
      <div className="wedding-admin-field-grid">
        <label className="wedding-admin-field-full"><span>WeddingWire member ID</span><input inputMode="numeric" autoComplete="off" maxLength={12} value={memberId} onChange={(e) => setMemberId(e.target.value)} /></label>
      </div>
      <fieldset className="wedding-admin-checks">
        <legend>Show on the page</legend>
        <label><input type="checkbox" checked={showRatingBadge} onChange={(e) => setShowRatingBadge(e.target.checked)} /> <span>Rating badge</span></label>
        <label><input type="checkbox" checked={showAwardBadge} onChange={(e) => setShowAwardBadge(e.target.checked)} /> <span>Couples&rsquo; Choice Award badge</span></label>
        <label><input type="checkbox" checked={showReviews} onChange={(e) => setShowReviews(e.target.checked)} /> <span>Reviews</span></label>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="staff-actions">
        <button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {saved && !error && <span className="coach-manager-message">Saved ✓</span>}
      </div>
    </div>
  );
}
