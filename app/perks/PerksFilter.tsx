"use client";

import { useEffect, useState } from "react";

// Filter the perks by section. The page is built with every section
// showing (so it reads the same to a search engine and with scripts off);
// choosing a section hides the others.
export function PerksFilter({ sections }: { sections: { slug: string; name: string }[] }) {
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-perk-section]").forEach((el) => {
      el.hidden = chosen !== null && el.dataset.perkSection !== chosen;
    });
  }, [chosen]);

  return (
    <div className="perks-filter" role="group" aria-label="Show perks for">
      <button type="button" className={chosen === null ? "is-on" : ""} aria-pressed={chosen === null} onClick={() => setChosen(null)}>All</button>
      {sections.map((section) => (
        <button key={section.slug} type="button" className={chosen === section.slug ? "is-on" : ""} aria-pressed={chosen === section.slug} onClick={() => setChosen(section.slug)}>{section.name}</button>
      ))}
    </div>
  );
}
