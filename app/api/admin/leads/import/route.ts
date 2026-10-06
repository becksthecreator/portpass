import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { listSections } from "@/db/categories";
import { importLeads } from "@/db/leads";
import { requireAdminApi } from "@/lib/auth/admin";
import { LEAD_STATUS_LABEL, parseTrackerCsv } from "@/lib/scout/leads";

const MAX_CHARS = 1_000_000;
const MAX_ROWS = 1000;

// Admin -> Leads: the one-off import of the Prospect Tracker's "Prospects"
// sheet, saved as CSV. Preview first (nothing is saved), then apply. A
// business already in Leads, or marked "do not contact", is skipped.
// Per address, per server instance (Brief 21, part E): a stuck button or a
// script cannot hammer this.
const limited = createRateLimiter(10, 10 * 60_000);

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many imports in a short time. Wait a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { csv?: unknown; apply?: unknown } | null;
  const csv = typeof body?.csv === "string" ? body.csv : "";
  if (!csv.trim()) return NextResponse.json({ error: "Paste the CSV, or choose the file." }, { status: 400 });
  if (csv.length > MAX_CHARS) return NextResponse.json({ error: "That file is too large." }, { status: 413 });

  const sections = await listSections({ includeHidden: true });
  const parsed = parseTrackerCsv(csv, sections);
  if (parsed.drafts.length === 0) return NextResponse.json({ error: "No businesses found. The file needs a \"Business\" column." }, { status: 400 });
  if (parsed.drafts.length > MAX_ROWS) return NextResponse.json({ error: `That's more than ${MAX_ROWS} rows.` }, { status: 413 });

  const preview = {
    total: parsed.drafts.length,
    skipped: parsed.skipped,
    unmappedColumns: parsed.unmappedColumns,
    byStatus: Object.entries(
      parsed.drafts.reduce<Record<string, number>>((counts, draft) => {
        const label = LEAD_STATUS_LABEL[draft.status];
        counts[label] = (counts[label] ?? 0) + 1;
        return counts;
      }, {}),
    ).map(([status, count]) => ({ status, count })),
    withScore: parsed.drafts.filter((d) => d.score !== null).length,
    noSection: parsed.drafts.filter((d) => !d.section).map((d) => d.businessName),
    sample: parsed.drafts.slice(0, 5).map((d) => ({ businessName: d.businessName, section: d.section, status: LEAD_STATUS_LABEL[d.status], score: d.score })),
  };
  if (body?.apply !== true) return NextResponse.json({ preview });

  const outcome = await importLeads(parsed.drafts, auth.session.userId);
  return NextResponse.json({ preview, outcome });
}
