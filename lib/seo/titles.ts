// Page titles and descriptions for search (brief 11, 2). Every public
// page gets its own: two pages with the same title compete with each
// other. Descriptions use real counts and real names, and stay under 155
// characters so a search result doesn't cut them off.

export const DESCRIPTION_MAX = 155;

// Cuts at a word, with an ellipsis, only when it must.
export function fitDescription(text: string, max = DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max * 0.6)));
  return `${atWord.replace(/[\s,;:.·–-]+$/, "")}…`;
}

// "A, B and C"; "A, B and 3 more".
export function nameList(names: string[], max = 3): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

// "Sports & Fitness in Nassau & The Bahamas | PortPass Bahamas";
// a subsection: "Photo Booths · Entertainment in Nassau | PortPass Bahamas".
export function sectionTitle(section: string, subsection?: string | null): string {
  return subsection ? `${subsection} · ${section} in Nassau | PortPass Bahamas` : `${section} in Nassau & The Bahamas | PortPass Bahamas`;
}

export function sectionDescription(name: string, businesses: string[]): string {
  const what = name.toLowerCase();
  if (businesses.length === 0) return fitDescription(`${name} in Nassau and The Bahamas, coming soon to PortPass. Tell us what you're looking for and we'll let you know when it opens.`);
  const count = businesses.length === 1 ? `1 ${what} business` : `${businesses.length} ${what} businesses`;
  return fitDescription(`${count} you can book in Nassau on PortPass: ${nameList(businesses)}. Real prices, schedules and booking online.`);
}

// "Futprep Athletics: Sports & Fitness in Nassau | PortPass"; off New
// Providence, the island: "… in George Town, Exuma | PortPass".
export function businessTitle(name: string, what: string | null, area: string | null, island: string | null = null): string {
  const onNewProvidence = !island || /new providence/i.test(island);
  const town = onNewProvidence ? "Nassau" : island;
  const place = area && area.toLowerCase() !== town.toLowerCase() ? `${area}, ${town}` : town;
  return what ? `${name}: ${what} in ${place} | PortPass` : `${name} in ${place} | PortPass`;
}

// The business's own line, then what it costs and how to book.
export function businessDescription(name: string, oneLiner: string | null, fromCents: number | null): string {
  const lead = (oneLiner ?? "").trim().replace(/[.!]*$/, "");
  const price = fromCents === null ? "" : ` From $${fromCents % 100 === 0 ? fromCents / 100 : (fromCents / 100).toFixed(2)}.`;
  return fitDescription(`${lead ? `${lead}.` : `${name} in Nassau.`}${price} See prices and book online on PortPass.`);
}
