import Link from "next/link";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { bizDisplay, ppSans } from "@/app/fonts";
import { listPublicCoachProfiles } from "@/db/coaches";
import { getOrganizationListingBySlug } from "@/db/organizations";
import { getFutprepAvailability, type FutprepAvailability } from "@/db/registrations";
import { campDays, formatDateRange } from "@/lib/futprepTerms";
import { portpassWhatsAppUrl } from "@/lib/contact";

// Where the empty state sends parents instead (brief 27 A): the two things
// Futprep runs every week. No dates here: a camp's dates appear only once
// its row is public and its registration window is open.
const SATURDAY_SESSIONS_HREF = "/sports-fitness/futprep-athletics";
const PRIVATE_SESSIONS_HREF = "/futprep/book";

// Futprep's holiday camps (brief 06 v2, A1.6): every public camp with an
// open registration window. Spots left change with each registration, so
// the page is rebuilt at most a minute after a change.
export const revalidate = 60;

export const metadata = {
  title: "Futprep holiday camps | PortPass Bahamas",
  description: "Futprep Athletics football camps in Nassau during the school holidays: dates, ages, prices and registration.",
};

async function openCamps(): Promise<FutprepAvailability[]> {
  try {
    return (await getFutprepAvailability()).filter((offer) => offer.programType === "camp");
  } catch (error) {
    console.error("camps page: availability failed, showing none", error);
    return [];
  }
}

// A saved Instagram handle makes "@futprep" a link; without one it stays
// plain text, so the page never points at an account nobody confirmed.
async function instagramHandle(): Promise<string | null> {
  try {
    const handle = (await getOrganizationListingBySlug("futprep"))?.instagramHandle?.replace(/^@/, "").trim();
    return handle || null;
  } catch {
    return null;
  }
}

async function campCoaches(): Promise<{ name: string; photo: string | null; title: string }[]> {
  try {
    const { coaches } = await listPublicCoachProfiles();
    return coaches.filter((c) => c.member_type === "coach").map((c) => ({ name: c.display_name, photo: c.photo_url, title: c.position_title }));
  } catch {
    return [];
  }
}

const CLOSES = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Nassau" });

function initials(name: string): string {
  return name.replace(/^Coach\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default async function FutprepCampsPage() {
  const [camps, coaches, instagram] = await Promise.all([openCamps(), campCoaches(), instagramHandle()]);
  const whatsapp = portpassWhatsAppUrl("Hi, I'd like to hear about the next Futprep holiday camp");

  return (
    <div className={`${bizDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Sports & Fitness", href: "/sports-fitness" }, { label: "Futprep Athletics", href: "/sports-fitness/futprep-athletics" }, { label: "Holiday camps", href: "/futprep/camps" }]} />
      <main className="tpl-page camps-page">
        <section className="camps-hero">
          <span className="camps-eyebrow">Futprep Athletics · Holiday camps</span>
          <h1>Football camps for the school holidays.</h1>
          <p>Mornings of coaching, games and friends on the field, run by the Futprep coaches. Register online and pay by bank transfer or cash.</p>
        </section>

        {camps.length === 0 ? (
          <section className="camps-empty">
            <h2>No camps open right now.</h2>
            <p>
              Follow{" "}
              {instagram ? <a href={`https://www.instagram.com/${encodeURIComponent(instagram)}/`} target="_blank" rel="noopener noreferrer">@{instagram}</a> : "@futprep"}{" "}
              for the next one.
            </p>
            <div className="camps-empty-links">
              <Link className="tpl-offering-cta" href={SATURDAY_SESSIONS_HREF}>Saturday sessions <span aria-hidden="true">→</span></Link>
              <Link className="tpl-offering-cta" href={PRIVATE_SESSIONS_HREF}>Private sessions <span aria-hidden="true">→</span></Link>
            </div>
          </section>
        ) : (
          <section className="camps-list" aria-label="Open camps">
            {camps.map((camp) => {
              const days = campDays(camp.termStartDate, camp.termEndDate, camp.breakDates);
              const full = camp.spotsRemaining === 0;
              return (
                <article className="camps-card" key={`${camp.programId}:${camp.termId}`}>
                  <div className="camps-card-head">
                    <h2>{camp.name}</h2>
                    <p className="camps-dates">{formatDateRange(camp.termStartDate, camp.termEndDate)} · {days.length} {days.length === 1 ? "day" : "days"}</p>
                  </div>
                  <dl className="camps-facts">
                    <div><dt>Daily</dt><dd>{camp.dailyStartTime || camp.time}–{camp.dailyEndTime || camp.endTime}</dd></div>
                    <div><dt>Ages</dt><dd>{camp.ageLabel}</dd></div>
                    <div><dt>Where</dt><dd>{camp.location}</dd></div>
                    <div><dt>Camp fee</dt><dd>{formatPriceCents(camp.termFeeCents)}</dd></div>
                    <div><dt>Spots left</dt><dd>{full ? "Full" : `${camp.spotsRemaining} of ${camp.capacity}`}</dd></div>
                    {camp.registrationClosesAt && <div><dt>Registration closes</dt><dd>{CLOSES.format(new Date(camp.registrationClosesAt))}</dd></div>}
                  </dl>
                  {camp.whatToBring && (
                    <div className="camps-bring"><strong>What to bring</strong><p>{camp.whatToBring}</p></div>
                  )}
                  {full ? (
                    <a className="tpl-offering-cta" href={whatsapp} target="_blank" rel="noopener noreferrer">Camp full: ask about a waitlist <span aria-hidden="true">→</span></a>
                  ) : (
                    <Link className="tpl-offering-cta" href={`/futprep/register?program=${encodeURIComponent(camp.slug)}&term=${camp.termId}`}>Register for {camp.name} <span aria-hidden="true">→</span></Link>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {coaches.length > 0 && (
          <section className="camps-coaches" aria-label="The coaches">
            <h2>Who runs the camp</h2>
            <ul>
              {coaches.map((coach) => (
                <li key={coach.name}>
                  {coach.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- coach photos are small local files
                    <img src={coach.photo} alt="" width={56} height={56} />
                  ) : (
                    <span className="camps-initials" aria-hidden="true">{initials(coach.name)}</span>
                  )}
                  <span><strong>{coach.name}</strong><small>{coach.title}</small></span>
                </li>
              ))}
            </ul>
            <p><Link href="/futprep/coaches">Meet the coaches →</Link></p>
          </section>
        )}
      </main>
      <SiteFooter orgLine="Futprep Athletics · Booking and payments powered by PortPass" />
    </div>
  );
}
