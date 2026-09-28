import Link from "next/link";
import { getSectionTiles } from "@/lib/navSections";

// "Where do you want to go?" as a compact grid: one tile per section from
// the categories table (same fail-soft fallback as the nav), each with an
// icon, the name and a Live / Coming soon chip. Two columns on a phone,
// which is what brings the section from 1,263px down under 600px.
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
  return (
    <div className="home-sections-grid">
      {tiles.map((tile) => {
        const live = liveSlugs.has(tile.slug);
        return (
          <Link className={`home-section-card${live ? " is-live" : ""}`} href={tile.href} key={tile.slug}>
            <SectionIcon slug={tile.slug} />
            <span className={`home-section-chip${live ? " is-live" : ""}`}>{live ? "Live" : "Coming soon"}</span>
            <h3>{tile.name}</h3>
            {tile.line && <p>{tile.line}</p>}
            <b>{live ? "Browse →" : "Tell us what you need →"}</b>
          </Link>
        );
      })}
    </div>
  );
}
