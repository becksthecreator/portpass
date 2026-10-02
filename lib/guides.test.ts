import { describe, expect, it } from "vitest";
import { cleanGuide, parseGuideBody, parseInline, publishProblem, WRITER_NOTE } from "./guides";

describe("a guide's words", () => {
  it("turns headings, paragraphs and lists into blocks", () => {
    const blocks = parseGuideBody("Intro line one\nline two.\n\n## Saturday sports\n\nFootball for ages 4 to 12.\n\n- Bring water\n- Bring boots\n\n### Fees\n\nFrom $35.");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "h2", "p", "ul", "h3", "p"]);
    expect(blocks[0]).toEqual({ kind: "p", parts: [{ kind: "text", text: "Intro line one line two." }] });
    expect(blocks[3]).toEqual({ kind: "ul", items: [[{ kind: "text", text: "Bring water" }], [{ kind: "text", text: "Bring boots" }]] });
  });

  it("links only to PortPass pages or secure sites; anything else stays plain text", () => {
    expect(parseInline("Book a [class](/futprep/register) now")).toEqual([{ kind: "text", text: "Book a " }, { kind: "link", text: "class", href: "/futprep/register", external: false }, { kind: "text", text: " now" }]);
    expect(parseInline("[site](https://example.com/x)")).toEqual([{ kind: "link", text: "site", href: "https://example.com/x", external: true }]);
    // A full PortPass address becomes a link within the site.
    expect(parseInline("[us](https://portpassbahamas.com/weddings)")).toEqual([{ kind: "link", text: "us", href: "/weddings", external: false }]);
    for (const bad of ["[x](javascript:alert(1))", "[x](//evil.example)", "[x](http://example.com)", "[x](data:text/html,hi)"]) {
      expect(parseInline(bad).every((part) => part.kind === "text")).toBe(true);
    }
    expect(parseInline("**Free** taster")).toEqual([{ kind: "bold", text: "Free" }, { kind: "text", text: " taster" }]);
  });

  it("never carries HTML: tags stay as text", () => {
    const blocks = parseGuideBody("<script>alert(1)</script> and <b>bold</b>");
    expect(blocks).toEqual([{ kind: "p", parts: [{ kind: "text", text: "<script>alert(1)</script> and <b>bold</b>" }] }]);
  });
});

describe("publishing a guide", () => {
  const ready = { title: "Things to do in Nassau with kids", description: "Things to do with children in Nassau: sports classes, camps and parties.", body: "Real words. ".repeat(50) };

  it("is refused while an [Antonio: …] note is left, without a description or a live business", () => {
    expect(publishProblem(ready, 1)).toBeNull();
    expect(publishProblem({ ...ready, body: `${ready.body}\n\n[Antonio: your picks.]` }, 1)).toMatch(/notes/);
    expect(publishProblem({ ...ready, description: "Short" }, 1)).toMatch(/description/);
    expect(publishProblem({ ...ready, body: "Too short." }, 1)).toMatch(/short/);
    expect(publishProblem(ready, 0)).toMatch(/business/);
    expect(WRITER_NOTE.test("[Antonio: a few lines]")).toBe(true);
  });

  it("checks the address and the title", () => {
    expect(cleanGuide({ slug: "Things-To-Do", title: "Things to do in Nassau", description: " x ", body: "y" })).toEqual({ ok: true, value: { slug: "things-to-do", title: "Things to do in Nassau", description: "x", body: "y" } });
    expect(cleanGuide({ slug: "things to do", title: "Things to do in Nassau" })).toMatchObject({ ok: false });
    expect(cleanGuide({ slug: "-bad-", title: "Things to do in Nassau" })).toMatchObject({ ok: false });
    expect(cleanGuide({ slug: "ok", title: "Short" })).toMatchObject({ ok: false });
  });
});
