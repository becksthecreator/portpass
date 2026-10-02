import { after } from "next/server";

// Runs `work` once the response has gone, and keeps the server alive until
// it finishes. Without this an email started just before the response can
// be cut off part-way: sent but never written to the Messages log, or
// logged as failed when it arrived. Outside a request (tests, scripts)
// there is nothing to keep alive, so the work just runs.
export function afterResponse(work: () => Promise<unknown>): void {
  const safe = () => work().catch((error) => console.error("after the response", error instanceof Error ? error.message : ""));
  try {
    after(safe);
  } catch {
    void safe();
  }
}
