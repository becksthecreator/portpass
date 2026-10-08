import { escapeHtml } from "./email";

// The emails around a Futprep private-session request (Brief 29, part A),
// the pure part: subjects and bodies. db/privateSessionNotices.ts decides
// who gets them and sends them. Nothing about the child beyond a first
// name and an age; never a health field; never a full account number.

export type RequestFacts = {
  referenceCode: string;
  serviceName: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  durationMinutes: number;
  priceCents: number | null;
  coachName: string | null; // the preferred coach, or null for "any available coach"
  parentName: string;
  parentPhone: string;
  childFirstName: string;
  childAge: number;
  locationPreference: string;
  sessionGoal: string;
};

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const dayOf = (iso: string) => DAY.format(new Date(`${iso}T12:00:00Z`)).replace(",", "");
export const money = (cents: number | null) => (cents === null ? "to be confirmed" : `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`);
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function shell(title: string, body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#171717">
    <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${body}
    <p style="color:#647069;font-size:12px;margin-top:32px">Futprep Athletics · Sent via PortPass</p>
  </div>`;
}

const row = (label: string, value: string) => `<tr><td style="padding:6px 0;color:#647069">${label}</td><td style="padding:6px 0;text-align:right">${value}</td></tr>`;

function whenLine(f: RequestFacts): string {
  return `${dayOf(f.date)} · ${f.startTime} · ${f.durationMinutes} minutes`;
}

// To the parent, the moment the request is saved.
export function requestReceivedEmail(f: RequestFacts): { subject: string; html: string } {
  const subject = `We've got your request · ${f.referenceCode}`;
  const html = shell("We've got your request", `
      <p>Hi ${escapeHtml(f.parentName)},</p>
      <p>Your request for a <strong>${escapeHtml(f.serviceName)}</strong> for ${escapeHtml(f.childFirstName)} has reached Futprep.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row("Coach", escapeHtml(f.coachName ?? "Any available coach"))}
        ${row("Suggested time", escapeHtml(whenLine(f)))}
        ${row("Price", escapeHtml(money(f.priceCents)))}
        ${row("Reference", `<strong>${escapeHtml(f.referenceCode)}</strong>`)}
      </table>
      <p><strong>What happens next:</strong> a coach reads it and accepts, suggests another time, or passes it to a colleague. You get an email either way, usually within a day.</p>
      <p><strong>It isn't confirmed yet.</strong> Nothing is booked, and nothing is owed, until a coach accepts. Then you pay the coach in cash at the session or by bank transfer with your reference.</p>
      <p>Need to change something? Reply to this email or message Futprep on WhatsApp and quote <strong>${escapeHtml(f.referenceCode)}</strong>.</p>
    `);
  return { subject, html };
}

// To the coach and to Futprep's owner or admins. The child is a first name
// and an age; the parent's name and phone are what the coach needs to call.
export function newRequestStaffEmail(f: RequestFacts, portalUrl: string): { subject: string; html: string } {
  const subject = `New private session request · ${f.referenceCode} · ${dayOf(f.date)} ${f.startTime} · ${f.serviceName}`;
  const html = shell("New private session request", `
      <p>A parent has asked for a <strong>${escapeHtml(f.serviceName)}</strong>${f.coachName ? ` with <strong>${escapeHtml(f.coachName)}</strong>` : " with any available coach"}.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row("Reference", `<strong>${escapeHtml(f.referenceCode)}</strong>`)}
        ${row("Suggested time", escapeHtml(whenLine(f)))}
        ${row("Child", `${escapeHtml(f.childFirstName)}, age ${f.childAge}`)}
        ${row("Parent", `${escapeHtml(f.parentName)} · ${escapeHtml(f.parentPhone)}`)}
        ${row("Price", escapeHtml(money(f.priceCents)))}
        ${f.locationPreference ? row("Where they suggested", escapeHtml(f.locationPreference)) : ""}
        ${f.sessionGoal ? row("Focus", escapeHtml(f.sessionGoal.slice(0, 200))) : ""}
      </table>
      <p><a href="${escapeHtml(portalUrl)}" style="color:#f0245c;font-weight:700">Accept, refer or decline in the staff portal →</a></p>
      <p style="color:#647069;font-size:13px">The parent has been told it is not confirmed until a coach accepts. Accepting emails them the time, place, price and how to pay.</p>
    `);
  return { subject, html };
}

// To the parent when a coach declines, with the reason.
export function requestDeclinedEmail(f: RequestFacts, reason: string): { subject: string; html: string } {
  const subject = `About your Futprep request · ${f.referenceCode}`;
  const html = shell("About your request", `
      <p>Hi ${escapeHtml(f.parentName)},</p>
      <p>We're sorry: Futprep can't take the <strong>${escapeHtml(f.serviceName)}</strong> for ${escapeHtml(f.childFirstName)} at ${escapeHtml(whenLine(f))}.</p>
      <p><strong>Why:</strong> ${escapeHtml(reason)}</p>
      <p>Nothing is owed. If another time or another coach would work, send a new request from the coaches page, or reply to this email and we'll find one together.</p>
      <p style="color:#647069;font-size:13px">Reference ${escapeHtml(f.referenceCode)}</p>
    `);
  return { subject, html };
}

// To the parent when the request is passed to another coach.
export function requestReferredEmail(f: RequestFacts, newCoachName: string, note: string): { subject: string; html: string } {
  const subject = `Your Futprep request is with ${newCoachName} · ${f.referenceCode}`;
  const html = shell("A different coach", `
      <p>Hi ${escapeHtml(f.parentName)},</p>
      <p>Your request for a <strong>${escapeHtml(f.serviceName)}</strong> for ${escapeHtml(f.childFirstName)} has been passed to <strong>${escapeHtml(newCoachName)}</strong>${f.coachName ? ` instead of ${escapeHtml(f.coachName)}` : ""}.</p>
      ${note ? `<p>${escapeHtml(note)}</p>` : ""}
      <p>${escapeHtml(newCoachName)} will accept it or suggest another time, and you'll get an email. It isn't confirmed until then, and nothing is owed.</p>
      <p style="color:#647069;font-size:13px">Reference ${escapeHtml(f.referenceCode)}</p>
    `);
  return { subject, html };
}
