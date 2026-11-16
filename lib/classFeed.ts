import { futprepEmailButton, futprepEmailShell } from "@/lib/futprepEmail";

// The class feed's rules and its email, kept pure so they are tested
// without a database. db/classFeed.ts reads and writes the posts;
// app/api/futprep/staff/class-posts sends the emails.

export const POST_MAX = 2000;

// Who is "in the class" for the feed: the same statuses the roster counts
// (db/staff.ts rosterForSession), plus a taster child, whose parent wants
// to hear about the Saturday too. Waitlisted and cancelled families don't.
export const FEED_STATUSES = ["pending_details", "pending", "confirmed", "trial"] as const;

export type PostCheck = { ok: true; body: string } | { ok: false; error: string };

// Trims the text, keeps the coach's line breaks (at most two blank lines
// in a row) and refuses an empty or over-long post.
export function checkPostBody(raw: unknown): PostCheck {
  if (typeof raw !== "string") return { ok: false, error: "Write the update first." };
  const body = raw.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (!body) return { ok: false, error: "Write the update first." };
  if (body.length > POST_MAX) return { ok: false, error: `Keep it under ${POST_MAX} characters (this one is ${body.length}).` };
  return { ok: true, body };
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// "Futprep Kickers, Term 2"
export function classLabel(programName: string, termName: string): string {
  return termName ? `${programName}, ${termName}` : programName;
}

// The first line of the post, shortened, for the subject and the preview.
export function postPreview(body: string, max = 60): string {
  const line = body.split("\n").find((l) => l.trim())?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export type ClassPostEmailInput = {
  programName: string;
  termName: string;
  authorName: string;
  body: string;
  feedUrl: string;
};

// One email per parent, never a shared "To" line: parents don't see each
// other's addresses, which a WhatsApp group shows to everyone.
export function classPostEmail(input: ClassPostEmailInput): { subject: string; html: string } {
  const label = classLabel(input.programName, input.termName);
  const subject = `${input.programName}: ${postPreview(input.body)}`;
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;line-height:1.5">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const who = input.authorName.trim() ? escape(input.authorName.trim()) : "Futprep";
  const html = futprepEmailShell(`Update for ${label}`, `
      <p style="margin:0 0 14px;color:#647069;font-size:13px">From ${who}</p>
      ${paragraphs}
      ${futprepEmailButton(input.feedUrl, "See all class updates")}
      <p style="font-size:13px;color:#647069">You get this because your child is registered in ${escape(label)}. Questions? Ask your coach at the field, or message Futprep on WhatsApp.</p>
    `);
  return { subject, html };
}
