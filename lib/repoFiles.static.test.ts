import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// This repo is public. On 20 Nov 2026 a private look book (photos, drafts)
// was committed under private/ and sat on GitHub for 15 minutes before it
// was removed (STATE.md, known issues). This check fails any PR that adds:
//   - anything under private/, or
//   - a PDF, photo or Office document outside public/,
// unless its folder is on the reviewed list below. Private material
// (client documents, look books, screenshots of private pages) belongs in
// Supabase Storage or the shared notes folder, never here.

const BLOCKED_TYPES = /\.(pdf|jpe?g|png|webp|heic|gif|docx?|xlsx?|pptx?|zip)$/i;

// Folders where committed screenshots and pictures are fine. Each line was
// looked at by a person: PR screenshots of PUBLIC pages, or brand files.
// To add one, say why in the PR; never a folder for a private page.
export const ALLOWED_FOLDERS = [
  "public/",
  "docs/futprep/part-a/", // Futprep staff screens, TEST data (brief 27)
  "docs/rebrand/before/", // public pages before the rebrand
  "docs/rebrand/after/", // public pages after the rebrand
  "docs/website-must-fix/", // #257: public marketing pages at 375px
  "docs/seo-canonicals/", // #259: /about at 375px
  "docs/home-new-set-of-eyes/", // #263: home and /pricing at 375 and 1440px
];

export function forbiddenFiles(files: string[], allowed: readonly string[] = ALLOWED_FOLDERS): string[] {
  return files.filter((file) => {
    const path = file.replace(/\\/g, "/");
    if (path.startsWith("private/")) return true;
    if (!BLOCKED_TYPES.test(path)) return false;
    return !allowed.some((folder) => path.startsWith(folder));
  });
}

function trackedFiles(): string[] {
  // Fails loudly (rather than passing) if git can't be asked.
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
}

describe("nothing private is committed to this public repo", () => {
  it("no tracked file is under private/, and no PDF, photo or document sits outside the reviewed folders", () => {
    const files = trackedFiles();
    expect(files.length).toBeGreaterThan(100);
    expect(forbiddenFiles(files), "Move these to Supabase Storage or the shared notes folder, or add a reviewed folder to ALLOWED_FOLDERS in lib/repoFiles.static.test.ts").toEqual([]);
  });

  it("the rule itself", () => {
    expect(
      forbiddenFiles([
        "private/lookbook/futprep-draft1/index.html",
        "private/notes.txt",
        "Futprep Term 2 Plan.pdf",
        "docs/briefs/agreement.docx",
        "app/lookbook/photo.jpg",
        "docs/website-must-fix/about.jpg",
        "public/brand/print/logo.pdf",
        "app/page.tsx",
        "docs\\rebrand\\after\\home.png",
      ]),
    ).toEqual(["private/lookbook/futprep-draft1/index.html", "private/notes.txt", "Futprep Term 2 Plan.pdf", "docs/briefs/agreement.docx", "app/lookbook/photo.jpg"]);
  });
});
