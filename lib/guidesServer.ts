import "server-only";
import { revalidateTag } from "next/cache";
import { GUIDES_TAG } from "@/db/guides";
import { bumpListings } from "@/lib/revalidate";

// A guide saved, published or unpublished: drop the cached list and the
// pages built from it (the guide, /guides, business pages that link back).
export function bumpGuides(): void {
  try {
    revalidateTag(GUIDES_TAG, { expire: 0 });
  } catch {
    // Not inside a Next request (tests, scripts): nothing to invalidate.
  }
  bumpListings();
}

export function guideRefusal(error: unknown): { status: number; error: string } | null {
  const message = error instanceof Error ? error.message : "";
  if (message === "NOT_FOUND") return { status: 404, error: "Not found." };
  if (message === "SLUG_TAKEN") return { status: 409, error: "Another guide already has that address." };
  if (message === "SLUG_FROZEN") return { status: 409, error: "A guide that has been published keeps its address, so links to it keep working." };
  if (message === "BAD_BUSINESS") return { status: 400, error: "One of the businesses no longer exists. Reload the page." };
  if (message === "NOT_PUBLISHABLE") return { status: 409, error: (error as { detail?: string }).detail ?? "This guide isn't ready to publish." };
  return null;
}
