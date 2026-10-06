"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Brief 22 (M4): moving between a section and its subsections cross-fades
// (the "card" transition type, lib/motion/public.css).
const CHIP_TYPES = ["card"];

export type SubsectionChip = { slug: string | null; name: string; href: string; live: number };

// The subsection picker under a section heading (round 5, §4): "All" first,
// then one chip per subsection with its live count or "Soon". Each chip is a
// real link, so choosing one changes the URL (/entertainment/djs), the page
// can be shared and Back works. On a phone the row scrolls sideways; on a
// desktop with more than six subsections the row gives way to a
// "Show: All ▾" select that navigates to the same URLs.
export function SubsectionPicker({ label, items, current }: { label: string; items: SubsectionChip[]; current: string | null }) {
  const router = useRouter();
  const many = items.length > 7;
  const currentHref = items.find((item) => item.slug === current)?.href ?? items[0]?.href ?? "";
  return (
    <nav className={`subsection-picker${many ? " subsection-picker-many" : ""}`} aria-label={label}>
      <div className="subsection-chips">
        {items.map((item) => {
          const isCurrent = item.slug === current;
          return (
            <Link key={item.href} href={item.href} className={`subsection-chip${isCurrent ? " is-current" : ""}`} aria-current={isCurrent ? "page" : undefined} transitionTypes={CHIP_TYPES}>
              {item.name}
              {item.slug !== null && <small>{item.live > 0 ? item.live : "Soon"}</small>}
            </Link>
          );
        })}
      </div>
      {many && (
        <label className="subsection-select">
          <span>Show:</span>
          <select value={currentHref} onChange={(event) => router.push(event.target.value)}>
            {items.map((item) => (
              <option key={item.href} value={item.href}>
                {item.name}
                {item.slug !== null ? (item.live > 0 ? ` (${item.live})` : " · Soon") : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}
