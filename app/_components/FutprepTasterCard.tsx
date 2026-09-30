import Link from "next/link";
import { getFutprepAvailability } from "@/db/registrations";
import { tasterCardCopy, upcomingTaster } from "@/lib/futprepClasses";
import { nassauToday } from "@/lib/futprepTerms";

// The free taster card on the Futprep page (brief 12): shown only while a
// public class has a taster Saturday still to come and its term is taking
// registrations. The date and classes come from the database; it never
// breaks the page it sits on.
export async function FutprepTasterCard() {
  let taster: ReturnType<typeof upcomingTaster> = null;
  try {
    taster = upcomingTaster(await getFutprepAvailability(), nassauToday());
  } catch {
    return null;
  }
  if (!taster) return null;
  const copy = tasterCardCopy(taster);
  return (
    <section className="camps-promo taster-promo" aria-label="Free taster Saturday">
      <div>
        <span className="camps-eyebrow">PortPass member perk</span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <Link className="tpl-offering-cta" href="/futprep/trial">Book the taster <span aria-hidden="true">→</span></Link>
    </section>
  );
}
