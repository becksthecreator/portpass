// The site search (brief 11): every word typed must appear somewhere in
// what is searched, ignoring case and accents. Short words ("in", "a")
// don't count.

const fold = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function searchTerms(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2)
    .slice(0, 8);
}

export function matchesQuery(terms: string[], fields: Array<string | null | undefined>): boolean {
  if (!terms.length) return false;
  const haystack = fold(fields.filter(Boolean).join(" "));
  // "football" finds "footballers"; a plural typed finds the singular too.
  return terms.every((term) => haystack.includes(term) || (term.length > 3 && term.endsWith("s") && haystack.includes(term.slice(0, -1))));
}
