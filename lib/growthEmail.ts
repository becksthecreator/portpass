import type { GrowthReport } from "@/db/growth";
import { escapeHtml, portpassEmailShell } from "./email";
import { formatCents, monthLabel, previousMonth, shortDate } from "./growth";

// The two emails of the growth brief (05, parts 2 and 3). Both go to the
// business's own people, never to a parent, and neither carries anything
// about a child beyond a first name and a class.

const SITE = "https://portpassbahamas.com";

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 12px 6px 0;color:#647069">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:700;text-align:right">${escapeHtml(value)}</td></tr>`;
}

function table(rows: string[]): string {
  return `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 18px">${rows.join("")}</table>`;
}

function heading(text: string): string {
  return `<h2 style="font-size:15px;margin:22px 0 8px">${escapeHtml(text)}</h2>`;
}

// The monthly report: the same numbers as the growth page, on one page.
// `month` is the month it reports on ("2026-10"), sent on the 1st of the next.
export function growthReportEmail(report: GrowthReport, month: string): { subject: string; html: string } {
  const term = report.current;
  const value = report.value;
  // On the 1st the month just ended is "last month" in the report.
  const monthFee = value.month === month ? value.thisMonth : previousMonth(value.month) === month ? value.lastMonth : { families: 0, collectedCents: 0, feeCents: 0 };
  const parts: string[] = [`<p style="font-size:14px;line-height:1.5;margin:0 0 6px">${escapeHtml(report.organizationName)}: ${escapeHtml(monthLabel(month))}${term ? `, ${escapeHtml(term.label)} so far` : ""}.</p>`];

  if (term) {
    parts.push(heading("Found you"));
    parts.push(table([row("Page views", String(term.found.views)), ...term.found.bySource.slice(0, 5).map((s) => row(s.label, String(s.views)))]));
    parts.push(heading("Asked"));
    parts.push(table([row("WhatsApp taps", String(term.asked.whatsappTaps)), row("Register clicks", String(term.asked.registerClicks)), row("Private session requests", String(term.asked.privateRequests))]));
    parts.push(heading("Booked"));
    parts.push(table([
      row("Forms opened", String(term.booked.started)),
      row("Places taken", String(term.booked.completed)),
      row("Children from new families", String(term.booked.newFamilyChildren)),
      row("Children from returning families", String(term.booked.returningFamilyChildren)),
      ...term.booked.classes.map((c) => row(`${c.programName}: places filled`, `${c.registered} of ${c.capacity} (${c.fillPercent}%)`)),
    ]));
    parts.push(heading("Paid"));
    parts.push(table([row("Fees due", formatCents(term.paid.dueCents)), row("Collected", formatCents(term.paid.collectedCents)), row("Outstanding", formatCents(term.paid.outstandingCents))]));
    parts.push(heading("Showed up"));
    parts.push(table([
      row("Average attendance", term.showedUp.averagePercent === null ? "Not marked yet" : `${term.showedUp.averagePercent}%`),
      ...term.showedUp.sessions.slice(0, 5).map((s) => row(`${shortDate(s.date)} · ${s.programName}`, s.taken ? `${s.present} of ${s.enrolled}` : "Not marked")),
    ]));
    if (report.missedTwo.length > 0) {
      parts.push(`<p style="font-size:14px;line-height:1.5;margin:0 0 18px"><strong>Missed two in a row:</strong> ${report.missedTwo.map((m) => `${escapeHtml(m.childFirstName)} (${escapeHtml(m.programName)})`).join(", ")}.</p>`);
    }
  } else {
    parts.push(`<p style="font-size:14px;line-height:1.5">No term is running or coming up yet.</p>`);
  }

  parts.push(heading("PortPass value"));
  parts.push(table([
    row(`New families PortPass brought who paid in ${monthLabel(month)}`, String(monthFee.families)),
    row("Fees collected from them", formatCents(monthFee.collectedCents)),
    row(value.onPlan ? `PortPass fee (${value.terms.rateBps / 100}%)` : `What ${value.terms.rateBps / 100}% would be`, formatCents(monthFee.feeCents)),
    ...(value.term ? [row(`Cap for ${value.term.label}`, `${formatCents(value.term.feeCents)} of ${formatCents(value.term.capCents)}${value.term.capApplied ? " (cap reached)" : ""}`)] : []),
  ]));
  if (!value.onPlan) parts.push(`<p style="color:#647069;font-size:12px;line-height:1.5;margin:0 0 18px">You are not on the Grow With Us plan, so nothing is invoiced for this. It shows what the plan would come to.</p>`);
  parts.push(`<p style="font-size:14px;margin:0"><a href="${SITE}/business/futprep/growth" style="color:#B9532A;font-weight:700">Open the full report</a></p>`);

  return { subject: `${report.organizationName}: growth report for ${monthLabel(month)}`, html: portpassEmailShell("Your growth report", parts.join("")) };
}

// Saturday morning, to the coach on duty: one tap to the roster.
export function attendanceNudgeEmail(input: { coachName: string; programName: string; startTime: string; sessionId: number }): { subject: string; html: string } {
  const link = `${SITE}/futprep/staff/coach?session=${input.sessionId}`;
  const body = `<p style="font-size:15px;line-height:1.5;margin:0 0 18px">Hi ${escapeHtml(input.coachName)}. ${escapeHtml(input.programName)}${input.startTime ? ` starts at ${escapeHtml(input.startTime)}` : " is on today"}. Please mark who came as the session starts.</p>
    <p style="margin:0"><a href="${link}" style="background:#B9532A;border-radius:999px;color:#fff;display:inline-block;font-weight:700;padding:12px 22px;text-decoration:none">Open today's roster</a></p>`;
  return { subject: `Mark today's attendance: ${input.programName}`, html: portpassEmailShell("Mark today's attendance", body) };
}
