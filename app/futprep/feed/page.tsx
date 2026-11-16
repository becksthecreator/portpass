import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listParentFeed } from "@/db/classFeed";
import { getSession } from "@/lib/auth/session";
import "./feed.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Class updates | Futprep",
  description: "Updates from your child's Futprep coaches.",
  robots: { index: false, follow: false },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Nassau" });

// The class feed, parents' side (Nov 2026). A parent signs in with the
// email they registered with (a code sent to it, or Google), and sees the
// updates for every class their children are in, on one page.
export default async function FutprepFeedPage() {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent("/futprep/feed")}`);
  const feed = await listParentFeed(session.email ?? null);

  return (
    <main className="futprep-theme my-status-page parent-feed">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><BrandLogo /></Link>
        <div className="registration-header-right">
          <Link className="header-link" href="/sports-fitness/futprep-athletics">Futprep home</Link>
          <Link className="header-link" href="/account">Your account</Link>
        </div>
      </header>
      <section className="my-status-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Futprep · Class updates</div>
        <h1>From your coaches.</h1>
        {feed.classes.length > 0 && (
          <p>
            {feed.classes.map((c) => `${c.children.join(" and ")} in ${c.programName}`).join("; ")}.
          </p>
        )}
      </section>

      {feed.classes.length === 0 ? (
        <section className="parent-feed-empty">
          <h2>No Futprep class found for {session.email}.</h2>
          <p>Updates show here for the email address you registered with. If you used a different one, sign in with that address instead.</p>
          <p><Link className="primary-button" href="/futprep/register">Register for a class</Link></p>
        </section>
      ) : feed.posts.length === 0 ? (
        <section className="parent-feed-empty">
          <h2>No updates yet.</h2>
          <p>When a coach posts to your child&rsquo;s class, it shows here and we email it to you.</p>
        </section>
      ) : (
        <ol className="parent-feed-list">
          {feed.posts.map((p) => (
            <li key={p.id}>
              <div className="parent-feed-meta">
                <strong>{p.classLabel}</strong>
                <span>{when(p.createdAt)}{p.authorName ? ` · ${p.authorName}` : ""}</span>
              </div>
              <p>{p.body}</p>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
