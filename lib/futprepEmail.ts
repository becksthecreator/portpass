import { EMAIL_PALETTE } from "@/lib/futprepTheme";

// Futprep's emails (brief 27, D): one shell for all of them. A navy header
// with the academy's name in mint, navy text on white, a pink button with
// navy words (never white on pink), and pink-deep for a plain link. Pure:
// callers escape what they put in `bodyHtml`.
const p = EMAIL_PALETTE;

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function futprepEmailShell(title: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:${p.text}">
    <div style="background:${p.headerBg};border-radius:12px 12px 0 0;padding:18px 22px">
      <p style="margin:0;color:${p.eyebrow};font-size:12px;font-weight:800;letter-spacing:3px">FUTPREP ATHLETICS</p>
      <h1 style="margin:8px 0 0;color:${p.headerText};font-size:22px;line-height:1.2">${escape(title)}</h1>
    </div>
    <div style="padding:20px 22px 8px">
    ${bodyHtml}
    </div>
    <p style="color:${p.muted};font-size:12px;margin:24px 22px 0">Futprep Athletics · Sent via PortPass</p>
  </div>`;
}

// The one action in an email: a pink button with navy words.
export function futprepEmailButton(href: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${escape(href)}" style="display:inline-block;background:${p.button};color:${p.buttonText};font-weight:800;text-decoration:none;padding:12px 20px;border-radius:999px">${escape(label)}</a></p>`;
}

export function futprepEmailLink(href: string, label: string): string {
  return `<a href="${escape(href)}" style="color:${p.link};font-weight:700">${escape(label)}</a>`;
}
