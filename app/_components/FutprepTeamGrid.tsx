import Link from "next/link";
import { CoachPhoto } from "@/app/_components/CoachPhoto";
import { listPublicCoachProfiles } from "@/db/coaches";
import { initialsOf } from "@/lib/team";

// The team grid on the Futprep home page (brief 16, C3): every public team
// member with their photo (or initials on navy), name and nickname, linking
// to that person's card on the coaches page, where the bios, availability
// and booking live. Reads
// the same rows as /futprep/coaches, so a photo uploaded on the Team page
// shows in both places. Never breaks the page it sits on.
export async function FutprepTeamGrid() {
  let coaches: Awaited<ReturnType<typeof listPublicCoachProfiles>>["coaches"] = [];
  try {
    ({ coaches } = await listPublicCoachProfiles());
  } catch {
    return null;
  }
  if (coaches.length === 0) return null;
  return (
    <section className="team-promo" aria-labelledby="futprep-team-heading">
      <div className="team-promo-head">
        <div>
          <span className="camps-eyebrow">The team</span>
          <h2 id="futprep-team-heading">Meet the Futprep coaches.</h2>
        </div>
        <Link className="tpl-offering-cta" href="/futprep/coaches">Coaches &amp; private sessions <span aria-hidden="true">→</span></Link>
      </div>
      <ul className="team-promo-grid">
        {coaches.map((coach) => (
          <li key={coach.slug}>
            <Link href={"/futprep/coaches#" + coach.slug}>
              {coach.photo_url ? (
                <CoachPhoto src={coach.photo_url} alt="" loading="lazy" width={160} height={160} fallback={<span className="team-promo-initials" aria-hidden="true">{initialsOf(coach.display_name)}</span>} />
              ) : (
                <span className="team-promo-initials" aria-hidden="true">{initialsOf(coach.display_name)}</span>
              )}
              <strong>{coach.display_name}</strong>
              {coach.nickname && <span className="team-promo-nick">&ldquo;{coach.nickname}&rdquo;</span>}
              <small>{coach.position_title}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
