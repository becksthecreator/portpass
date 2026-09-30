import Link from "next/link";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { getFutprepAvailability } from "@/db/registrations";
import { formatDateRange } from "@/lib/futprepTerms";

// The "Holiday camps" card on the Futprep page (brief 06 v2, A1.6). Shown
// only while at least one public camp is open for registration; it never
// breaks the page it sits on.
export async function FutprepCampsCard() {
  let camps: Awaited<ReturnType<typeof getFutprepAvailability>> = [];
  try {
    camps = (await getFutprepAvailability()).filter((offer) => offer.programType === "camp");
  } catch {
    return null;
  }
  if (camps.length === 0) return null;
  const first = camps[0];
  return (
    <section className="camps-promo" aria-label="Holiday camps">
      <div>
        <span className="camps-eyebrow">Holiday camps</span>
        <h2>{camps.length === 1 ? first.name : "Futprep holiday camps"}</h2>
        <p>
          {camps.length === 1
            ? `${formatDateRange(first.termStartDate, first.termEndDate)} · ${first.dailyStartTime || first.time}–${first.dailyEndTime || first.endTime} · ages ${first.ageMin}–${first.ageMax} · ${formatPriceCents(first.termFeeCents)}`
            : `${camps.length} camps open for registration.`}
        </p>
      </div>
      <Link className="tpl-offering-cta" href="/futprep/camps">See the camps <span aria-hidden="true">→</span></Link>
    </section>
  );
}
