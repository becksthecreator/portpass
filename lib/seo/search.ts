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

export function matchesQuery(terms: string[], fields: Array<string | null | undefined>): boolean {
  if (!terms.length) return false;
  const haystack = fold(fields.filter(Boolean).join(" "));
  // "football" finds "footballers"; a plural typed finds the singular too.
  return terms.every((term) => haystack.includes(term) || (term.length > 3 && term.endsWith("s") && haystack.includes(term.slice(0, -1))));
}
