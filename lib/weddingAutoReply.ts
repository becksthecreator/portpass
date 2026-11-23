import { cleanEnvValue, escapeHtml, portpassFrom } from "./email";

// The instant reply a couple gets after sending their plan from
// bahamasweddingsbythesea.com. Written in the business's voice, sent from
// the PortPass sending address with replies going to the business's own
// inbox. Off unless WEDDING_AUTOREPLY is "on", so nothing reaches a real
// couple until Antonio has approved the wording and the switch is flipped.
// The email carries no plan details: names and the package name only.
export type WeddingAutoReply = { from: string | undefined; replyTo: string | undefined; subject: string; html: string };

export function greetingName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{M} &'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
}

function settings(): Record<string, string | undefined> {
  return {
    WEDDING_AUTOREPLY: process.env.WEDDING_AUTOREPLY,
    WEDDING_DESK_REPLY_TO: process.env.WEDDING_DESK_REPLY_TO,
    WEDDING_DESK_FROM_EMAIL: process.env.WEDDING_DESK_FROM_EMAIL,
  };
}

export function weddingAutoReply(input: { names: string; packageName: string | null }, env: Record<string, string | undefined> = settings()): WeddingAutoReply | null {
  if (cleanEnvValue(env.WEDDING_AUTOREPLY)?.toLowerCase() !== "on") return null;
  const replyTo = cleanEnvValue(env.WEDDING_DESK_REPLY_TO);
  // Without an inbox to reply to, the couple would answer a no-reply
  // address, so the email isn't sent at all.
  if (!replyTo) return null;

  // Only letters, spaces and & ' - (60 at most) reach the greeting, so
  // whatever someone types as "names" can't carry a link or a message to
  // the inbox it's sent to. No dots: "word.tld" is turned into a link by
  // most mail apps.
  const names = escapeHtml(greetingName(input.names) || "there");
  const pkg = input.packageName ? `<p style="margin:0 0 14px">You chose the <strong>${escapeHtml(input.packageName)}</strong> package as a starting point. We can adjust it together.</p>` : "";

  return {
    from: cleanEnvValue(env.WEDDING_DESK_FROM_EMAIL) ?? portpassFrom(),
    replyTo,
    subject: "We have your wedding plan, Bahamas Weddings By The Sea",
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#17323A;font-size:16px;line-height:1.6">
      <p style="margin:0 0 14px">Hello ${names},</p>
      <p style="margin:0 0 14px">Thank you for sending your plan. It has reached the Wedding Desk, and we will be in touch within one business day to arrange your consultation.</p>
      ${pkg}
      <p style="margin:0 0 14px">Nothing is booked yet and your date is not held until we confirm it with you. If you have questions in the meantime, reply to this email.</p>
      <p style="margin:0 0 4px">Warm regards,</p>
      <p style="margin:0">Antonio Beckford<br>Bahamas Weddings By The Sea, Nassau</p>
    </div>`,
  };
}
