import Link from "next/link";
import { guidesMentioning } from "@/db/guides";
import "./guides.css";

// A business's page links back to the published guides that mention it
// (brief 11, 4). Nothing renders when there are none.
export async function InOurGuides({ organizationSlug }: { organizationSlug: string }) {
  const guides = await guidesMentioning(organizationSlug);
  if (guides.length === 0) return null;
  return (
    <section className="in-our-guides" aria-labelledby="in-our-guides-title">
      <h2 id="in-our-guides-title">In our guides</h2>
      <ul>
        {guides.map((guide) => <li key={guide.slug}><Link href={`/guides/${guide.slug}`}>{guide.title}</Link></li>)}
      </ul>
    </section>
  );
}
