"use client";

import { useState } from "react";
import { reviewRequestMessage } from "@/lib/seo/googleBusiness";

// "Ask for a Google review" (brief 11, 7). After a booking or a term, the
// business sends this to one customer itself: copied, or opened in its own
// WhatsApp where it picks who to send it to. PortPass never sends it, and
// there is no way to send it to many people at once.
export function GoogleReviewCard({ businessName, url }: { businessName: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const message = reviewRequestMessage(businessName, url);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="account-section" aria-labelledby="google-review-title">
      <h2 id="google-review-title">Ask for a Google review</h2>
      <p className="auth-lead">After a booking or a term, send this to a happy customer yourself. Reviews help people find you on Google.</p>
      <p className="biz-review-message">{message}</p>
      <div className="auth-actions">
        <button className="primary-button" type="button" onClick={() => void copy()}>{copied ? "Copied" : "Copy the message"}</button>
        <a className="auth-text-button" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">Open in WhatsApp and choose who →</a>
      </div>
    </section>
  );
}
