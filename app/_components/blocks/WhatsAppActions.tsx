// WhatsApp is how the businesses PortPass targets actually talk to their
// customers, so every listing offers it next to the booking button, never
// instead of it. Plain links: wa.me needs no JavaScript.
export function MessageOnWhatsApp({ e164, businessName, className = "tpl-button tpl-button-secondary" }: { e164: string; businessName: string; className?: string }) {
  const digits = e164.replace(/\D/g, "");
  const text = `Hi ${businessName}, I found you on PortPass and I'd like to ask about booking.`;
  return (
    <a className={className} href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
      Message on WhatsApp <span aria-hidden="true">↗</span>
    </a>
  );
}

export function ShareOnWhatsApp({ url, text, className = "share-whatsapp" }: { url: string; text: string; className?: string }) {
  return (
    <a className={className} href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">
      Share on WhatsApp <span aria-hidden="true">↗</span>
    </a>
  );
}
