import { describe, expect, it } from "vitest";
import { z } from "zod";
import { bodyOf, readJson, unknownFields } from "./body";

const post = (body: string | null, type = "application/json") => new Request("https://portpass.test/api/x", { method: "POST", body: body ?? undefined, headers: body === null ? {} : { "content-type": type } });

describe("readJson with bodyOf", () => {
  const Body = bodyOf(["email", "token", "next"]);

  it("accepts the named fields, any of them missing, with their values untouched", async () => {
    const read = await readJson(post(JSON.stringify({ email: "a@example.com", token: 123456 })), Body);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toEqual({ email: "a@example.com", token: 123456 });
    const empty = await readJson(post("{}"), Body);
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.value).toEqual({});
  });

  it("refuses a field the route does not read, and says which, never the value", async () => {
    const read = await readJson(post(JSON.stringify({ email: "a@example.com", password: "hunter2-not-real", isAdmin: true })), Body);
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.response.status).toBe(400);
      const answer = await read.response.json();
      expect(answer).toEqual({ error: "Invalid request.", unknownFields: ["isAdmin", "password"] });
      expect(JSON.stringify(answer)).not.toContain("hunter2");
    }
  });

  it("refuses what is not JSON, not an object, or no body at all", async () => {
    for (const raw of ["not json", "[1,2]", "\"text\"", "42", "null", ""]) {
      const read = await readJson(post(raw), Body);
      expect(read.ok, `should refuse ${JSON.stringify(raw)}`).toBe(false);
      if (!read.ok) expect(read.response.status).toBe(400);
    }
    const none = await readJson(post(null), Body);
    expect(none.ok).toBe(false);
  });

  it("uses the route's own message when one is given", async () => {
    const read = await readJson(post("nope"), Body, "Enter the 6-digit code from your email.");
    expect(read.ok).toBe(false);
    if (!read.ok) expect(await read.response.json()).toEqual({ error: "Enter the 6-digit code from your email." });
  });

  it("works with a full schema too, and reports only unknown keys as fields", async () => {
    const Strict = z.strictObject({ ok: z.boolean() });
    const wrongType = await readJson(post(JSON.stringify({ ok: "yes" })), Strict);
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(await wrongType.response.json()).toEqual({ error: "Invalid request." });
    expect(unknownFields(Strict.safeParse({ ok: true, extra: 1 }).error!)).toEqual(["extra"]);
  });
});
