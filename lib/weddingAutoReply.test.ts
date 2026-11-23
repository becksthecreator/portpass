import { describe, expect, it } from "vitest";
import { weddingAutoReply } from "./weddingAutoReply";

const on = { WEDDING_AUTOREPLY: "on", WEDDING_DESK_REPLY_TO: "desk@example.test", WEDDING_DESK_FROM_EMAIL: "Wedding Desk <desk@send.example.test>" };

describe("the wedding auto-reply", () => {
  it("stays off unless switched on", () => {
    expect(weddingAutoReply({ names: "A & B", packageName: null }, {})).toBeNull();
    expect(weddingAutoReply({ names: "A & B", packageName: null }, { ...on, WEDDING_AUTOREPLY: "off" })).toBeNull();
  });

  it("isn't sent without an inbox for the couple to reply to", () => {
    expect(weddingAutoReply({ names: "A & B", packageName: null }, { ...on, WEDDING_DESK_REPLY_TO: "" })).toBeNull();
  });

  it("replies to the business's inbox and escapes the couple's names", () => {
    const reply = weddingAutoReply({ names: "<Ann> & Bo", packageName: "Pink Sand" }, on);
    expect(reply?.replyTo).toBe("desk@example.test");
    expect(reply?.from).toBe("Wedding Desk <desk@send.example.test>");
    expect(reply?.html).toContain("&lt;Ann&gt; &amp; Bo");
    expect(reply?.html).toContain("Pink Sand");
    expect(reply?.html).not.toContain("<Ann>");
  });
});
