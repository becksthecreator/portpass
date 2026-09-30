import { describe, expect, it } from "vitest";
import { parseAdminLink } from "./parse";

describe("parseAdminLink", () => {
  it("requires a title on create and an https link when one is given", () => {
    expect(parseAdminLink({}, { requireTitle: true })).toEqual({ error: "Give the tool a name." });
    expect(parseAdminLink({ title: "Handbook", url: "http://x" }, { requireTitle: true })).toEqual({ error: "The link must start with https://." });
    expect(parseAdminLink({ title: "Handbook", url: "https://claude.ai/a", sort: 2 }, { requireTitle: true })).toEqual({ value: { title: "Handbook", url: "https://claude.ai/a", sort: 2 } });
  });

  it("lets an update clear the link and description", () => {
    expect(parseAdminLink({ url: "", description: null }, { requireTitle: false })).toEqual({ value: { url: null, description: null } });
  });
});
