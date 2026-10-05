import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { retryClockSkewFetch } from "./supabaseRetryFetch";

const URL_READ = "https://project.supabase.test/rest/v1/organizations?select=id&contact_email=eq.someone%40example.com";

const skew = () =>
  new Response(JSON.stringify({ code: "PGRST303", message: "JWT issued at future", details: null, hint: null }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
const rows = () => new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { "content-type": "application/json" } });

function setup(...answers: Array<() => Response>) {
  const base = vi.fn<typeof fetch>(async () => {
    const next = answers.shift();
    if (!next) throw new Error("fetch was called more often than the test expected");
    return next();
  });
  const wait = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
  return { base, wait, fetchWithRetry: retryClockSkewFetch(base, { wait }) };
}

describe("retryClockSkewFetch", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  afterEach(() => warn.mockClear());
  afterAll(() => warn.mockRestore());

  it("hands back a good answer untouched, with one request", async () => {
    const { base, wait, fetchWithRetry } = setup(rows);
    const response = await fetchWithRetry(URL_READ, { method: "GET" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1 }]);
    expect(base).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("asks once more, after 300 ms, when a GET is refused with PGRST303", async () => {
    const { base, wait, fetchWithRetry } = setup(skew, rows);
    const response = await fetchWithRetry(URL_READ, { method: "GET", headers: { Prefer: "count=exact" } });
    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(300);
    // Same address and headers the second time.
    expect(base.mock.calls[1][0]).toBe(URL_READ);
    expect(base.mock.calls[1][1]).toMatchObject({ method: "GET", headers: { Prefer: "count=exact" } });
  });

  it("sends the second attempt with an abort signal, so a render's fetch memo cannot answer it", async () => {
    const { base, fetchWithRetry } = setup(skew, rows);
    await fetchWithRetry(URL_READ, { method: "GET" });
    expect(base.mock.calls[0][1]?.signal).toBeUndefined();
    const signal = base.mock.calls[1][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it("keeps the caller's own signal on the second attempt", async () => {
    const { base, fetchWithRetry } = setup(skew, rows);
    const controller = new AbortController();
    await fetchWithRetry(URL_READ, { method: "GET", signal: controller.signal });
    expect(base.mock.calls[1][1]?.signal).toBe(controller.signal);
  });

  it("treats a request with no method as a GET", async () => {
    const { base, fetchWithRetry } = setup(skew, rows);
    const response = await fetchWithRetry(URL_READ);
    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("reads the method from a Request object", async () => {
    const read = setup(skew, rows);
    expect((await read.fetchWithRetry(new Request(URL_READ))).status).toBe(200);
    expect(read.base).toHaveBeenCalledTimes(2);

    const write = setup(skew);
    expect((await write.fetchWithRetry(new Request(URL_READ, { method: "POST", body: "{}" }))).status).toBe(401);
    expect(write.base).toHaveBeenCalledTimes(1);
  });

  it("tries only once more: a second refusal is handed to the caller, body intact", async () => {
    const { base, wait, fetchWithRetry } = setup(skew, skew);
    const response = await fetchWithRetry(URL_READ, { method: "GET" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "PGRST303" });
    expect(base).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("retries a refused HEAD (a count), which has no body to carry the code", async () => {
    const { base, fetchWithRetry } = setup(() => new Response(null, { status: 401 }), () => new Response(null, { status: 200, headers: { "content-range": "*/7" } }));
    const response = await fetchWithRetry(URL_READ, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-range")).toBe("*/7");
    expect(base).toHaveBeenCalledTimes(2);
  });

  it.each(["POST", "PATCH", "PUT", "DELETE", "post"])("never repeats a %s, even one refused with PGRST303", async (method) => {
    const { base, wait, fetchWithRetry } = setup(skew);
    const response = await fetchWithRetry(URL_READ, { method, body: method === "DELETE" ? undefined : "{}" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "PGRST303" });
    expect(base).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("does not retry a 401 for any other reason, and leaves its body readable", async () => {
    const expired = () => new Response(JSON.stringify({ code: "PGRST301", message: "JWT expired" }), { status: 401 });
    const { base, fetchWithRetry } = setup(expired);
    const response = await fetchWithRetry(URL_READ, { method: "GET" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "PGRST301", message: "JWT expired" });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 401 whose body is not JSON, or another status that mentions the code", async () => {
    const html = setup(() => new Response("<html>Unauthorized</html>", { status: 401 }));
    expect((await html.fetchWithRetry(URL_READ, { method: "GET" })).status).toBe(401);
    expect(html.base).toHaveBeenCalledTimes(1);

    const serverError = setup(() => new Response(JSON.stringify({ code: "PGRST303" }), { status: 500 }));
    expect((await serverError.fetchWithRetry(URL_READ, { method: "GET" })).status).toBe(500);
    expect(serverError.base).toHaveBeenCalledTimes(1);
  });

  it("lets a network failure through as it is (withOneRetry handles those)", async () => {
    const base = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(retryClockSkewFetch(base)(URL_READ, { method: "GET" })).rejects.toThrow("fetch failed");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("notes the retry with the method and table only: no query string, no headers", async () => {
    const { fetchWithRetry } = setup(skew, rows);
    await fetchWithRetry(URL_READ, { method: "GET", headers: { apikey: "not-a-real-key", Authorization: "Bearer not-a-real-key" } });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls[0]);
    expect(logged).toContain("/rest/v1/organizations");
    expect(logged).not.toContain("example.com");
    expect(logged).not.toContain("not-a-real-key");
  });

  it("uses the global fetch of the moment when none is given", async () => {
    const original = globalThis.fetch;
    const patched = vi.fn<typeof fetch>(async () => rows());
    const fetchWithRetry = retryClockSkewFetch();
    globalThis.fetch = patched;
    try {
      expect((await fetchWithRetry(URL_READ)).status).toBe(200);
      expect(patched).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
