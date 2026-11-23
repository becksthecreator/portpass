import { describe, expect, it } from "vitest";
import { canRemovePost, checkPostBody, classLabel, classPostEmail, EMAILED_POSTS_PER_CLASS_PER_HOUR, FEED_STATUSES, POST_MAX, postPreview } from "./classFeed";

describe("checkPostBody", () => {
  it("trims, keeps line breaks and squeezes long runs of blank lines", () => {
    expect(checkPostBody("  Bring water.\r\n\r\n\r\n\r\n\r\nSee you at 9.  ")).toEqual({ ok: true, body: "Bring water.\n\n\nSee you at 9." });
  });

  it("refuses an empty post, a non-string and an over-long one", () => {
    expect(checkPostBody("   \n ").ok).toBe(false);
    expect(checkPostBody(42).ok).toBe(false);
    expect(checkPostBody(undefined).ok).toBe(false);
    expect(checkPostBody("x".repeat(POST_MAX)).ok).toBe(true);
    const long = checkPostBody("x".repeat(POST_MAX + 1));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error).toContain(String(POST_MAX + 1));
  });
});

describe("postPreview and classLabel", () => {
  it("takes the first non-empty line and shortens it", () => {
    expect(postPreview("\n\nNo class Saturday\nRain")).toBe("No class Saturday");
    const p = postPreview("a".repeat(100), 20);
    expect(p.length).toBe(20);
    expect(p.endsWith("…")).toBe(true);
  });

  it("names the class with its term", () => {
    expect(classLabel("Futprep Kickers", "Term 2")).toBe("Futprep Kickers, Term 2");
    expect(classLabel("Futprep Kickers", "")).toBe("Futprep Kickers");
  });
});

describe("classPostEmail", () => {
  const base = { programName: "Futprep Kickers", termName: "Term 2", authorName: "Coach Bex", feedUrl: "https://portpassbahamas.com/futprep/feed" };

  it("escapes what the coach wrote and keeps the paragraphs", () => {
    const { subject, html } = classPostEmail({ ...base, body: "No class <b>Saturday</b> & \"rain\"\nSorry\n\nSee you next week" });
    expect(subject).toBe("Futprep Kickers: No class <b>Saturday</b> & \"rain\"");
    expect(html).toContain("No class &lt;b&gt;Saturday&lt;/b&gt; &amp; &quot;rain&quot;<br>Sorry");
    expect(html).toContain("See you next week");
    expect(html).not.toContain("<b>Saturday</b>");
    expect(html).toContain("Update for Futprep Kickers, Term 2");
    expect(html).toContain("From Coach Bex");
    expect(html).toContain("https://portpassbahamas.com/futprep/feed");
  });

  it("says Futprep when the post has no author name", () => {
    expect(classPostEmail({ ...base, authorName: " ", body: "Hi" }).html).toContain("From Futprep");
  });

  it("never claims card payments work", () => {
    expect(classPostEmail({ ...base, body: "Hi" }).html.toLowerCase()).not.toMatch(/card payment|pay by card/);
  });
});

describe("who is in the class, who removes, how often (Security & QA, 23 Nov)", () => {
  it("counts confirmed places and tasters only, never a pending registration", () => {
    expect([...FEED_STATUSES]).toEqual(["confirmed", "trial"]);
  });

  it("lets a coach remove only their own update; an admin or the CEO any", () => {
    expect(canRemovePost("coach", "bex", "bex")).toBe(true);
    expect(canRemovePost("coach", "bex", "dre")).toBe(false);
    expect(canRemovePost("admin", "desk", "dre")).toBe(true);
    expect(canRemovePost("ceo", "alex", "dre")).toBe(true);
  });

  it("caps emailed updates per class per hour", () => {
    expect(EMAILED_POSTS_PER_CLASS_PER_HOUR).toBe(3);
  });
});
