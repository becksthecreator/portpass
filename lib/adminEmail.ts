import { escapeHtml, portpassEmailShell } from "./email";

// What a business's owner is told when PortPass acts on their listing
// (brief 08, 1.2): approved, sent back with a note, suspended, back on.
// Plain words, one thing to do next.

const SITE = "https://portpassbahamas.com";

export type BusinessNotice = "approved" | "live" | "sent_back" | "suspended" | "unsuspended" | "in_review";

const p = (html: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 16px">${html}</p>`;
const button = (href: string, label: string) => `<p style="margin:0"><a href="${href}" style="background:#B9532A;border-radius:999px;color:#fff;display:inline-block;font-weight:700;padding:12px 22px;text-decoration:none">${escapeHtml(label)}</a></p>`;

export function businessNoticeEmail(input: { notice: BusinessNotice; businessName: string; slug: string | null; note?: string | null }): { subject: string; html: string } {
  const name = escapeHtml(input.businessName);
  const dashboard = input.slug ? `${SITE}/business/${encodeURIComponent(input.slug)}` : `${SITE}/where-to`;
  const note = input.note ? `<blockquote style="border-left:3px solid #B9532A;font-size:15px;line-height:1.5;margin:0 0 16px;padding:2px 0 2px 14px">${escapeHtml(input.note)}</blockquote>` : "";

  if (input.notice === "live") {
    return { subject: `${input.businessName} is live on PortPass`, html: portpassEmailShell("Your page is live", `${p(`${name} is approved and live on PortPass. Customers can find it and get in touch now.`)}${button(dashboard, "Open my business")}`) };
  }
  if (input.notice === "approved") {
    return { subject: `${input.businessName} is approved on PortPass`, html: portpassEmailShell("Your page is approved", `${p(`${name} is approved. It goes live the moment one of your offerings has a price.`)}${button(`${dashboard}/settings`, "Add a price")}`) };
  }
  if (input.notice === "sent_back") {
    return { subject: `${input.businessName}: a few changes before it goes live`, html: portpassEmailShell("A few changes first", `${p(`We looked at ${name} and need a few changes before it goes live:`)}${note}${p("Make the changes, then send it to us again.")}${button(`${dashboard}/settings`, "Open my page")}`) };
  }
  if (input.notice === "suspended") {
    return { subject: `${input.businessName} is hidden on PortPass`, html: portpassEmailShell("Your page is hidden", `${p(`${name} is hidden from PortPass for now. The reason:`)}${note}${p("Your records are untouched. Reply to this email or message us on WhatsApp and we will sort it out together.")}`) };
  }
  if (input.notice === "in_review") {
    return { subject: `${input.businessName} is with PortPass for review`, html: portpassEmailShell("Your page is with us for review", `${p(`${name} is no longer hidden. A change to it is waiting for our review, and we will email you as soon as it is live.`)}${button(dashboard, "Open my business")}`) };
  }
  return { subject: `${input.businessName} is back on PortPass`, html: portpassEmailShell("Your page is back", `${p(`${name} is visible on PortPass again.`)}${button(dashboard, "Open my business")}`) };
}

// The message a founder sends the owner on WhatsApp with the claim link.
export function claimLinkMessage(businessName: string, url: string): string {
  return `Hi! Your ${businessName} page on PortPass Bahamas is ready. Open this link and follow the steps, and the page is yours to manage: ${url} (the link works once, for 30 days).`;
}
