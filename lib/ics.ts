// A class's sessions as a calendar file (RFC 5545), for "Add all 10 to my
// calendar" on the register (V4). It holds the class, the dates, the times
// and the place, and nothing about any child or parent, so it can be shared
// and needs no link token. Times are written in UTC (…Z) after working out
// Nassau's offset for each day, so the file is right on either side of a
// clock change and needs no time-zone block.

export type CalendarSession = { date: string; start: string; end: string };
export type CalendarInput = {
  uidPrefix: string; // stable per class and term, e.g. "futprep-lil-kickers-42"
  title: string; // "Futprep Lil Kickers · Term 2"
  location: string;
  description?: string;
  sessions: CalendarSession[];
  now?: Date;
};

const ZONE = "America/Nassau";

// "9:00 AM", "12:00 PM", "09:00", "9:00:00" -> [hours, minutes]; null if unreadable.
export function parseClock(value: string): [number, number] | null {
  const match = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\s*$/i.exec(value ?? "");
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const half = match[3]?.toLowerCase();
  if (minutes > 59 || hours > 23 || (half && (hours < 1 || hours > 12))) return null;
  if (half === "pm" && hours !== 12) hours += 12;
  if (half === "am" && hours === 12) hours = 0;
  return [hours, minutes];
}

// The UTC instant of a Nassau wall-clock time on a given day.
export function nassauToUtc(date: string, hours: number, minutes: number): Date {
  const guess = new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const asNassau = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess.getTime() + (guess.getTime() - asNassau));
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Text values escaped as RFC 5545 asks: backslash, semicolon, comma, newline.
const text = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const bytes = (value: string) => new TextEncoder().encode(value).length;

// Lines longer than 75 octets are folded with CRLF + space.
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (bytes(rest) > 75) {
    let cut = 75;
    while (bytes(rest.slice(0, cut)) > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(input: CalendarInput): string {
  const now = stamp(input.now ?? new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PortPass Bahamas//Class calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${text(input.title)}`];
  for (const session of input.sessions) {
    const start = parseClock(session.start);
    const end = parseClock(session.end);
    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(session.date)) continue;
    const startsAt = nassauToUtc(session.date, start[0], start[1]);
    const endsAt = end ? nassauToUtc(session.date, end[0], end[1]) : new Date(startsAt.getTime() + 60 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${input.uidPrefix}-${session.date}@portpassbahamas.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(startsAt)}`,
      `DTEND:${stamp(endsAt > startsAt ? endsAt : new Date(startsAt.getTime() + 60 * 60 * 1000))}`,
      `SUMMARY:${text(input.title)}`,
      `LOCATION:${text(input.location)}`,
      ...(input.description ? [`DESCRIPTION:${text(input.description)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
