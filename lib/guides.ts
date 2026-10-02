// Guides (brief 11, 3): the rules only, shared by the public pages, Admin
// -> Guides and the tests. A guide's body is plain text with a few marks,
// turned into blocks here and rendered as React elements (never as HTML),
// so nothing typed can run in a visitor's browser.

export const GUIDE_STATUSES = ["draft", "published"] as const;
export type GuideStatus = (typeof GUIDE_STATUSES)[number];

// A note left for the writer in a draft. A guide can't be published while
// one is left in it: the outline is never published as if it were the guide.
export const WRITER_NOTE = /\[Antonio:[^\]]*\]/;

export type GuideInline = { kind: "text"; text: string } | { kind: "bold"; text: string } | { kind: "link"; text: string; href: string; external: boolean };
export type GuideBlock = { kind: "h2" | "h3" | "p"; parts: GuideInline[] } | { kind: "ul"; items: GuideInline[][] };

// A link is to a PortPass page ("/sports-fitness") or a secure site
// ("https://..."). Anything else stays as plain text.
function safeHref(href: string): { href: string; external: boolean } | null {
  if (/^\/(?!\/)[^\s]*$/.test(href)) return { href, external: false };
  if (/^https:\/\/[^\s]+$/i.test(href)) {
    try {
      const url = new URL(href);
      return url.hostname === "portpassbahamas.com" || url.hostname === "www.portpassbahamas.com" ? { href: `${url.pathname}${url.search}${url.hash}`, external: false } : { href: url.toString(), external: true };
    } catch {
      return null;
    }
  }
  return null;
}

// "Book a [Saturday class](/futprep/register) for **any** child."
export function parseInline(text: string): GuideInline[] {
  const parts: GuideInline[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ kind: "text", text: text.slice(last, at) });
    if (match[1] !== undefined) {
      const link = safeHref(match[2]);
      parts.push(link ? { kind: "link", text: match[1], ...link } : { kind: "text", text: match[0] });
    } else {
      parts.push({ kind: "bold", text: match[3] });
    }
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export function parseGuideBody(body: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  for (const chunk of body.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((line) => /^[-*] /.test(line))) {
      blocks.push({ kind: "ul", items: lines.map((line) => parseInline(line.replace(/^[-*] /, ""))) });
      continue;
    }
    for (const [index, line] of lines.entries()) {
      if (line.startsWith("### ")) blocks.push({ kind: "h3", parts: parseInline(line.slice(4)) });
      else if (line.startsWith("## ")) blocks.push({ kind: "h2", parts: parseInline(line.slice(3)) });
      else {
        // Lines that follow each other make one paragraph.
        const rest = lines.slice(index).join(" ");
        blocks.push({ kind: "p", parts: parseInline(rest) });
        break;
      }
    }
  }
  return blocks;
}

export type GuideInput = { slug: string; title: string; description: string; body: string };

export function cleanGuide(input: unknown): { ok: true; value: GuideInput } | { ok: false; error: string } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : "");
  const slug = text(raw.slug, 80).toLowerCase();
  const title = text(raw.title, 90).replace(/\s+/g, " ");
  const description = text(raw.description, 170).replace(/\s+/g, " ");
  const body = text(raw.body, 30_000);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: "The address is lower-case words joined by dashes, like things-to-do-with-kids." };
  if (title.length < 8) return { ok: false, error: "Give the guide a title." };
  return { ok: true, value: { slug, title, description, body } };
}

// What stops a guide being published, in words; null when it is ready.
export function publishProblem(guide: { title: string; description: string; body: string }, listings: number): string | null {
  if (WRITER_NOTE.test(guide.body) || WRITER_NOTE.test(guide.description)) return "There are still [Antonio: …] notes in it. Replace each one with your own words first.";
  if (guide.description.trim().length < 50) return "Write a description of at least 50 characters: it is what search results show.";
  if (guide.body.trim().length < 400) return "The guide is very short. Write a little more before publishing.";
  if (listings === 0) return "Link at least one live business, so the guide sends readers somewhere they can book.";
  return null;
}
