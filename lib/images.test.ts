import { describe, expect, it } from "vitest";
import { isOptimisableSrc } from "./images";

describe("isOptimisableSrc", () => {
  it("accepts local files and the configured hosts", () => {
    expect(isOptimisableSrc("/futprep/lil-kickers/lil-kickers-group.jpg")).toBe(true);
    expect(isOptimisableSrc("https://cdckqdftrhkwkhvomqwg.supabase.co/storage/v1/object/public/org/1/a.jpg")).toBe(true);
    expect(isOptimisableSrc("https://images.unsplash.com/photo-1")).toBe(true);
  });

  it("falls back to a plain img for anything else", () => {
    expect(isOptimisableSrc("https://example.com/photo.jpg")).toBe(false);
    expect(isOptimisableSrc("not a url")).toBe(false);
  });
});
