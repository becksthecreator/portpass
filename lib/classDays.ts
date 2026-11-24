// The opening line of a class list: which days the classes run, and where
// when there is one place (parent home, PR 1, 24 Nov 2026). It used to say
// "Saturdays at Lyford Cay" whatever the classes were, so a weekday class
// read wrong. Camps run every weekday and are left out of the count.

const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type ClassOffer = { day?: string | null; location?: string | null; programType?: string | null };

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function classDaysLine(offers: readonly ClassOffer[]): string {
  const weekly = offers.filter((o) => o.programType !== "camp" && o.day && WEEK.includes(o.day));
  if (weekly.length === 0) return "";
  const days = WEEK.filter((d) => weekly.some((o) => o.day === d)).map((d) => `${d}s`);
  const places = [...new Set(weekly.map((o) => (o.location ?? "").trim()).filter(Boolean))];
  return `${list(days)}${places.length === 1 ? ` at ${places[0]}` : ""}.`;
}
