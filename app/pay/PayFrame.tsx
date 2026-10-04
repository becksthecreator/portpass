import type { CSSProperties, ReactNode } from "react";
import type { PublicView } from "@/db/paymentRequests";
import { DEMO_BANNER } from "@/lib/demoText";
import { formatPhoneDisplay } from "@/lib/phone";

// The frame of the customer's /pay pages: the business's name and logo,
// its colour as a thin stripe, and PortPass's one line underneath.

function brandStyle(color: string | null): CSSProperties | undefined {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? ({ "--pay-brand": color } as CSSProperties) : undefined;
}

export function PayFrame({ view, children }: { view: Pick<PublicView, "business"> | null; children: ReactNode }) {
  const business = view?.business;
  return (
    <main className="paypage" style={brandStyle(business?.brandColor ?? null)}>
      <div className="paypage-stripe" aria-hidden="true" />
      {/* A request from the demo business (brief 18, part B): nothing is owed. */}
      {business?.isDemo && <p className="paypage-demo" role="note">{DEMO_BANNER}</p>}
      <div className="paypage-wrap">
        {business && (
          <div className="paypage-biz">
            {business.logoUrl ? <img src={business.logoUrl} alt="" /> : <span className="paypage-biz-initial" aria-hidden="true">{business.name.slice(0, 1)}</span>}
            <div><strong>{business.name}</strong><span>via PortPass</span></div>
          </div>
        )}
        {children}
        <p className="paypage-foot">PortPass sends payment requests for businesses in The Bahamas. It never holds anyone&rsquo;s money. <a href="https://portpassbahamas.com">portpassbahamas.com</a></p>
      </div>
    </main>
  );
}

export function ContactBusiness({ business }: { business: PublicView["business"] }) {
  // The demo business has nobody to contact.
  if (business.isDemo) return null;
  const links = [
    business.whatsappE164 && { href: `https://wa.me/${business.whatsappE164.replace(/\D/g, "")}`, label: "WhatsApp", external: true },
    business.phoneE164 && { href: `tel:${business.phoneE164}`, label: `Call ${formatPhoneDisplay(business.phoneE164)}`, external: false },
    business.publicEmail && { href: `mailto:${business.publicEmail}`, label: "Email", external: false },
  ].filter(Boolean) as { href: string; label: string; external: boolean }[];
  if (links.length === 0) return null;
  return (
    <div className="paypage-contact">
      {links.map((l) => (
        <a key={l.href} className="paypage-btn is-small" href={l.href} target={l.external ? "_blank" : undefined} rel={l.external ? "noopener noreferrer" : undefined}>{l.label}</a>
      ))}
    </div>
  );
}

export function Unavailable({ title, detail, view }: { title: string; detail: string; view: PublicView | null }) {
  return (
    <PayFrame view={view}>
      <div>
        <p className="paypage-eyebrow">Payment request</p>
        <h1>{title}</h1>
      </div>
      <p className="paypage-muted">{detail}</p>
      {view && <ContactBusiness business={view.business} />}
    </PayFrame>
  );
}
