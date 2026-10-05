// The fetch the server's Supabase client uses (db/supabase.ts). It gives a
// read one more go when Supabase's gateway turns it away with PGRST303
// ("JWT issued at future"): a clock disagreement inside Supabase between
// the gateway that mints the short-lived token for our secret key and the
// API that checks it. About one read in 300 was refused this way in early
// October 2026, each one on its own, with the reads either side of it fine.
//
// Why here and not around the query (withOneRetry in db/supabase.ts): while
// a page renders, React and Next remember every GET by address and headers
// and hand the same answer to anyone who asks again. A query repeated
// inside the same render was therefore given the first 401 back without
// anything being sent; Supabase's own logs showed one request per failed
// homepage render, never two. A request that carries an abort signal is
// never remembered, so the second attempt below carries one.
//
// Reads only. GET and HEAD change nothing, so asking twice is safe; a
// POST, PATCH, PUT or DELETE is returned as it came, whatever it says.

type Fetch = typeof fetch;

type RetryOptions = {
  delayMs?: number;
  wait?: (ms: number) => Promise<void>;
};

const RETRY_DELAY_MS = 300;
const CLOCK_SKEW_CODE = "PGRST303";

function methodOf(input: Parameters<Fetch>[0], init: Parameters<Fetch>[1]): string {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

// Table or function name only: the query string can hold a filter value
// (an email, a reference code), and no header is ever read here.
function pathOf(input: Parameters<Fetch>[0]): string {
  try {
    return new URL(input instanceof Request ? input.url : String(input)).pathname;
  } catch {
    return "";
  }
}

async function isClockSkewRejection(response: Response, method: string): Promise<boolean> {
  if (response.status !== 401) return false;
  // The answer to a HEAD (a count) has no body to carry the code. These
  // requests are signed with the server's own key, so a 401 is never the
  // normal answer, and a second HEAD costs nothing.
  if (method === "HEAD") return true;
  try {
    // A copy, so the caller can still read the body it is handed.
    const body: unknown = await response.clone().json();
    return typeof body === "object" && body !== null && (body as { code?: unknown }).code === CLOCK_SKEW_CODE;
  } catch {
    return false;
  }
}

export function retryClockSkewFetch(baseFetch?: Fetch, options: RetryOptions = {}): Fetch {
  const delayMs = options.delayMs ?? RETRY_DELAY_MS;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // Looked up on each call, as supabase-js does, so this always goes
  // through whatever fetch the framework has installed by then.
  const send: Fetch = (input, init) => (baseFetch ?? fetch)(input, init);

  return async (input, init) => {
    const response = await send(input, init);
    const method = methodOf(input, init);
    if (method !== "GET" && method !== "HEAD") return response;
    if (!(await isClockSkewRejection(response, method))) return response;

    console.warn("supabase: read refused for clock skew (PGRST303), trying once more", { method, path: pathOf(input) });
    await wait(delayMs);
    return send(input, { ...init, signal: init?.signal ?? new AbortController().signal });
  };
}
