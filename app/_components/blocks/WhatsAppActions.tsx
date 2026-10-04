"use client";

import { track } from "@/lib/analytics";

// WhatsApp is how the businesses PortPass targets actually talk to their
// customers, so every listing offers it next to the booking button, never
// instead of it. Plain links underneath: wa.me needs no JavaScript; the
// JavaScript only adds the native share sheet and the click events.
export function MessageOnWhatsApp({ e164, businessName, org, className = "tpl-button tpl-button-secondary", label = "Message on WhatsApp" }: { e164: string; businessName: string; org?: string; className?: string; label?: string }) {
  const digits = e164.replace(/\D/g, "");
  const text = `Hi ${businessName}, I found you on PortPass and I'd like to ask about booking.`;
  return (
    <a
      className={className}
      href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("whatsapp_click", { org: org ?? businessName })}
    >
      {label} <span aria-hidden="true">↗</span>
    </a>
  );
}

// "Share": the phone's own share sheet where there is one (navigator.share
// -- iOS Safari, Android Chrome), otherwise the WhatsApp share link the
// anchor already points at (desktop browsers, or no JavaScript).
export function ShareOnWhatsApp({ url, text, org, className = "share-whatsapp" }: { url: string; text: string; org?: string; className?: string }) {
  const fallback = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  async function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    track("share_click", { org: org ?? url.replace(/^https?:\/\/[^/]+/, "") });
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    event.preventDefault();
    try {
      await navigator.share({ title: text.replace(/:\s*$/, ""), text, url });
    } catch {
      // the person closed the sheet, or the browser refused: the WhatsApp
      // link below is still one tap away, so nothing else to do
    }
  }
  return (
    <a className={className} href={fallback} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      Share <span aria-hidden="true">↗</span>
    </a>
  );
}
