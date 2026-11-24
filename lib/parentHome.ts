// Parent home, PR 2 (24 Nov 2026): the "this week" card at the top of a
// parent's account. For each child's class: the next session (day, time,
// place, a map link), what's owed, the coaches' latest update, and the way
// back to the business's own site. Built from rows the database already
// has; db/parentHome.ts reads them. Rule 3: of a child only the first name,
// and nothing from the health, emergency or pickup fields is ever read.

export type HomeRegistrationRow = {
  reference: string;
  organizationId: number;
  programId: number;
  termId: number;
  childName: string;
  status: string;
  paymentStatus: string;
  amountDueCents: number | null;
  trialSessionId: number | null;
};
export type HomeProgramRow = { id: number; name: string; location: string | null; locationNote: string | null; endTime: string | null };
export type HomeSessionRow = { id: number; programId: number; termId: number; date: string; startTime: string | null; location: string | null; status: string };
export type HomePostRow = { programId: number; termId: number; body: string; authorName: string; createdAt: string };
export type HomeBusinessRow = { id: number; name: string; slug: string | null; category: string | null; websiteUrl: string | null };

export type ThisWeekCard = {
  reference: string;
  childFirstName: string;
  className: string;
  business: string;
  status: "confirmed" | "trial" | "pending";
  next: { date: string; time: string; place: string; placeNote: string | null } | null;
  owed: { label: string; amountCents: number | null } | null;
  latest: { body: string; author: string; at: string } | null;
  statusHref: string | null;
  businessHref: string | null;
};

const SHOWN = new Set(["confirmed", "trial", "pending"]);
const POST_PREVIEW = 160;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

// "09:00:00" → "9:00 AM"; "" when there is no time.
export function clockTime(value: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!match) return "";
  const hours = Number(match[1]);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

export function previewText(body: string, max = POST_PREVIEW): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

// Only an http(s) address the business gave, else its page on PortPass.
export function businessHref(business: HomeBusinessRow | undefined): string | null {
  if (!business) return null;
  const site = (business.websiteUrl ?? "").trim();
  if (/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(site)) return site;
  if (business.slug && business.category) return `/${business.category}/${business.slug}`;
  return null;
}

function owed(row: HomeRegistrationRow): ThisWeekCard["owed"] {
  if (row.status === "trial") return null;
  if (row.paymentStatus === "paid" || row.paymentStatus === "waived") return null;
  const amount = row.amountDueCents && row.amountDueCents > 0 ? row.amountDueCents : null;
  return { label: row.paymentStatus === "partial" ? "Part paid" : "To pay", amountCents: amount };
}

export function buildThisWeek(input: {
  today: string;
  registrations: HomeRegistrationRow[];
  programs: HomeProgramRow[];
  sessions: HomeSessionRow[];
  posts: HomePostRow[];
  businesses: HomeBusinessRow[];
  statusHref: (business: HomeBusinessRow | undefined, reference: string) => string | null;
}): ThisWeekCard[] {
  const programs = new Map(input.programs.map((p) => [p.id, p]));
  const businesses = new Map(input.businesses.map((b) => [b.id, b]));
  const cards: ThisWeekCard[] = [];
  for (const row of input.registrations) {
    if (!SHOWN.has(row.status)) continue;
    const program = programs.get(row.programId);
    // A taster is one session; anyone else gets the next one still running.
    const upcoming = input.sessions
      .filter((s) => s.status !== "cancelled" && s.date >= input.today && s.programId === row.programId && s.termId === row.termId)
      .filter((s) => (row.status === "trial" ? s.id === row.trialSessionId : true))
      .sort((a, b) => (a.date === b.date ? (a.startTime ?? "").localeCompare(b.startTime ?? "") : a.date.localeCompare(b.date)))[0];
    // A class with nothing left this term (it has ended) drops off the card.
    if (!upcoming) continue;
    const start = clockTime(upcoming.startTime);
    const end = clockTime(program?.endTime);
    // Class updates go to confirmed and taster families only, as on
    // /futprep/feed (lib/classFeed.ts FEED_STATUSES): a registration still
    // waiting to be confirmed doesn't see them.
    const post = input.posts
      .filter((p) => row.status !== "pending" && p.programId === row.programId && p.termId === row.termId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const business = businesses.get(row.organizationId);
    cards.push({
      reference: row.reference,
      childFirstName: firstName(row.childName),
      className: program?.name ?? "Class",
      business: business?.name ?? "",
      status: row.status as ThisWeekCard["status"],
      next: {
        date: upcoming.date,
        time: start && end ? `${start}–${end}` : start,
        place: (upcoming.location ?? "").trim() || (program?.location ?? "").trim(),
        placeNote: program?.locationNote?.trim() || null,
      },
      owed: owed(row),
      latest: post ? { body: previewText(post.body), author: post.authorName, at: post.createdAt } : null,
      statusHref: input.statusHref(business, row.reference),
      businessHref: businessHref(business),
    });
  }
  return cards.sort((a, b) => (a.next!.date === b.next!.date ? a.childFirstName.localeCompare(b.childFirstName) : a.next!.date.localeCompare(b.next!.date)));
}
