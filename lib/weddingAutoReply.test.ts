import { describe, expect, it } from "vitest";
import { greetingName, weddingAutoReply } from "./weddingAutoReply";

const on = { WEDDING_AUTOREPLY: "on", WEDDING_DESK_REPLY_TO: "desk@example.test", WEDDING_DESK_FROM_EMAIL: "Wedding Desk <desk@send.example.test>" };

describe("the wedding auto-reply", () => {
  it("stays off unless switched on", () => {
    expect(weddingAutoReply({ names: "A & B", packageName: null }, {})).toBeNull();
    expect(weddingAutoReply({ names: "A & B", packageName: null }, { ...on, WEDDING_AUTOREPLY: "off" })).toBeNull();
  });

  it("isn't sent without an inbox for the couple to reply to", () => {
    expect(weddingAutoReply({ names: "A & B", packageName: null }, { ...on, WEDDING_DESK_REPLY_TO: "" })).toBeNull();
  });

  it("replies to the business's inbox and keeps only a plain greeting name", () => {
    const reply = weddingAutoReply({ names: "<Ann> & Bo", packageName: "Pink Sand" }, on);
    expect(reply?.replyTo).toBe("desk@example.test");
    expect(reply?.from).toBe("Wedding Desk <desk@send.example.test>");
    expect(reply?.html).toContain("Hello Ann &amp; Bo,");
    expect(reply?.html).toContain("Pink Sand");
    expect(reply?.html).not.toContain("<Ann>");
  });

  it("strips links and long text out of the names", () => {
    expect(greetingName("Win money at https://bad.example/x now")).toBe("Win money at httpsbadexamplex now");
    expect(greetingName("Zoë & José O'Neil-Smith")).toBe("Zoë & José O'Neil-Smith");
    expect(greetingName("a".repeat(200))).toHaveLength(60);
    const reply = weddingAutoReply({ names: "!!! ///", packageName: null }, on);
    expect(reply?.html).toContain("Hello there,");
  });
});
