// The site search (brief 11): every word typed must appear somewhere in
// what is searched, ignoring case and accents. Small words ("in", "the")
// don't count, and nor does the place when something else is asked for:
// everything on PortPass is in The Bahamas, so "photo booth nassau" means
// "photo booth".

const fold = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "near", "of", "on", "or", "the", "to", "with", "me", "my", "best", "find"]);
const PLACE_WORDS = new Set(["nassau", "bahamas", "bahamian", "new", "providence", "paradise", "island", "bs"]);

export function searchTerms(query: string): string[] {
  const words = fold(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2 && !SMALL_WORDS.has(word));
  const what = words.filter((word) => !PLACE_WORDS.has(word));
  return (what.length ? what : words).slice(0, 8);
}

// How many of the words typed appear: "football" finds "footballers"; a
// plural typed finds the singular too.
export function matchCount(terms: string[], fields: Array<string | null | undefined>): number {
  const haystack = fold(fields.filter(Boolean).join(" "));
  return terms.filter((term) => haystack.includes(term) || (term.length > 3 && term.endsWith("s") && haystack.includes(term.slice(0, -1)))).length;
}

export function matchesQuery(terms: string[], fields: Array<string | null | undefined>): boolean {
  return terms.length > 0 && matchCount(terms, fields) === terms.length;
}

// What to show: everything that has every word; when nothing does and more
// than one word was typed, the closest (most words matched first), marked
// as such on the page.
export function rankMatches<T>(terms: string[], items: T[], fields: (item: T) => Array<string | null | undefined>): { exact: boolean; items: T[] } {
  if (!terms.length) return { exact: true, items: [] };
  const scored = items.map((item, index) => ({ item, index, count: matchCount(terms, fields(item)) }));
  const all = scored.filter((s) => s.count === terms.length).map((s) => s.item);
  if (all.length || terms.length < 2) return { exact: true, items: all };
  return { exact: false, items: scored.filter((s) => s.count > 0).sort((a, b) => b.count - a.count || a.index - b.index).map((s) => s.item) };
}
