import Link from "next/link";
import { getSectionTiles } from "@/lib/navSections";
import { Reveal } from "./motion/Reveal";

// "Where do you want to go?" (brief 18, A1): the sections with something
// to book as full cards, and every section that isn't open yet in one
// "Coming next" row with a single "Tell us what you need" link. Sections
// come from the categories table (same fail-soft fallback as the nav); a
// section moves up to a card on its own when its first business goes live.
function SectionIcon({ slug }: { slug: string }) {
  const common = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (slug) {
    case "sports-fitness":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3c2.5 2.6 2.5 15.4 0 18M3.4 9.5c4.6 1.6 12.6 1.6 17.2 0M3.4 14.5c4.6-1.6 12.6-1.6 17.2 0" />
        </svg>
      );
    case "weddings":
      return (
        <svg {...common}>
          <circle cx="9" cy="13" r="5.5" />
          <circle cx="15" cy="13" r="5.5" />
          <path d="M12 4.5l1.5 2.5h-3z" />
        </svg>
      );
    case "venues":
      return (
        <svg {...common}>
          <path d="M3 21h18M5 21V8l7-4 7 4v13" />
          <path d="M9 21v-6h6v6M9 11h.01M15 11h.01" />
        </svg>
      );
    case "tours":
      return (
        <svg {...common}>
          <path d="M3 17c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0" />
          <path d="M5 14l1.5-4h11L19 14M12 4v6M12 4l5 6" />
        </svg>
      );
    case "entertainment":
      return (
        <svg {...common}>
          <path d="M9 18V6l10-2v12" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="16.5" cy="16" r="2.5" />
        </svg>
      );
    case "services":
      return (
        <svg {...common}>
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      );
    case "shop":
      return (
        <svg {...common}>
          <path d="M5 8h14l-1 12H6z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5l-2 5-5 2 2-5z" />
        </svg>
      );
  }
}

export async function SectionGrid({ liveSlugs }: { liveSlugs: Set<string> }) {
  const tiles = await getSectionTiles();
  // No counts at all (a database hiccup): every section as a plain card,
  // rather than calling the whole site "coming next".
  const known = liveSlugs.size > 0;
  const live = known ? tiles.filter((tile) => liveSlugs.has(tile.slug)) : tiles;
  const next = known ? tiles.filter((tile) => !liveSlugs.has(tile.slug)) : [];
  return (
    <>
      <Reveal className={`home-sections-grid${known ? " home-sections-live" : ""}`} variant="rise" stagger>
        {live.map((tile) => (
          <div className="home-section-slot" key={tile.slug}><Link className={`home-section-card${known ? " is-live" : ""}`} href={tile.href}>
            <SectionIcon slug={tile.slug} />
            {known && <span className="home-section-chip is-live">Open now</span>}
            <h3>{tile.name}</h3>
            {tile.line && <p>{tile.line}</p>}
            <b>Browse →</b>
          </Link></div>
        ))}
      </Reveal>
      {next.length > 0 && (
        <p className="home-coming-next">
          <b>Coming next:</b>{" "}
          {next.map((tile, index) => (
            <span key={tile.slug}>{index > 0 ? " · " : ""}<Link href={tile.href}>{tile.name}</Link></span>
          ))}
          <Link className="home-coming-next-ask" href="/tell-us">Tell us what you need →</Link>
        </p>
      )}
    </>
  );
}
