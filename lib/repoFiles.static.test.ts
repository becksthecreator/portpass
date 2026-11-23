import { execFileSync } from "node:child_process";
import { openSync, readSync, closeSync } from "node:fs";
import { describe, expect, it } from "vitest";

// This repo is public. On 20 Nov 2026 a private look book (photos, drafts)
// was committed under private/ and sat on GitHub for 15 minutes before it
// was removed (STATE.md, known issues). This check fails any PR that adds:
//   - anything in a folder called private (any case, any depth),
//   - anything with "lookbook" in its path outside the look book's code
//     (app/lookbook/, lib/lookbook/): the books themselves live in Storage,
//   - a file of a blocked type (documents, photos, video, exports such as
//     roster CSVs, archives, mail and contacts) outside the reviewed
//     folders below, or
//   - a file whose first bytes say it is a PDF, photo, video or zip-based
//     document, whatever its name, outside the reviewed folders.
// Private material belongs in Supabase Storage or the shared notes folder.
// Security & QA reviewed the rules (20 Nov, #266).

const BLOCKED_TYPES = new RegExp(
  "\\.(" +
    [
      "pdf", "rtf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "odg", "pages", "numbers", "key",
      "csv", "tsv",
      "jpg", "jpeg", "png", "webp", "gif", "svg", "avif", "heic", "heif", "tif", "tiff", "bmp",
      "mp4", "mov", "m4v", "webm", "avi", "mkv", "3gp",
      "zip", "7z", "rar", "tar", "gz", "tgz",
      "eml", "msg", "vcf",
    ].join("|") +
    ")$",
  "i",
);

// Where such files are fine. Each line was looked at by a person: what is
// published from public/ today, and PR screenshots of public pages or TEST
// data. public/ is NOT allowed whole: anything there goes live at
// portpassbahamas.com, so a private file dropped there would be published.
// To add a line, say why in the PR that adds the files; never for a
// private page. Folders are added by the PR that fills them.
export const ALLOWED_PATHS = [
  "public/brand/", // the PortPass brand files
  "public/weddings/", // Bahamas Weddings By The Sea's site
  "public/futprep/", // Futprep's public photos
  "public/carv-logo.png",
  "public/futprep-logo.png",
  "public/favicon.ico",
  "public/favicon.svg",
  "docs/futprep/part-a/", // Futprep staff screens, TEST data (brief 27)
  "docs/rebrand/before/", // public pages before the rebrand
  "docs/rebrand/after/", // public pages after the rebrand
  "docs/website-must-fix/", // #257: public marketing pages at 375px
  "docs/seo-canonicals/", // #259: /about (a public page) at 375px
  "docs/apply-any-business/", // #274: the public /apply form at 375px
];

const LOOKBOOK_CODE = ["app/lookbook/", "lib/lookbook/"];

const allowed = (path: string, list: readonly string[]) => list.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));

export function forbiddenFiles(files: string[], list: readonly string[] = ALLOWED_PATHS): string[] {
  return files.filter((file) => {
    const path = file.replace(/\\/g, "/");
    if (/(^|\/)private\//i.test(path)) return true;
    if (/lookbook/i.test(path) && !LOOKBOOK_CODE.some((prefix) => path.startsWith(prefix))) return true;
    return BLOCKED_TYPES.test(path) && !allowed(path, list);
  });
}

// The first bytes of a PDF, JPEG, PNG, GIF, WebP/AVI (RIFF), zip-based
// document (docx, xlsx, odt, zip) or an ISO media file (MP4, MOV, HEIC,
// AVIF), so a renamed file ("roster.txt") is caught too.
export function looksBinaryMedia(head: Buffer): boolean {
  const ascii = head.toString("latin1");
  return (
    ascii.startsWith("%PDF") ||
    (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) ||
    ascii.startsWith("\x89PNG") ||
    ascii.startsWith("GIF8") ||
    ascii.startsWith("RIFF") ||
    ascii.startsWith("PK\x03\x04") ||
    ascii.slice(4, 8) === "ftyp"
  );
}

function head(path: string): Buffer {
  const buffer = Buffer.alloc(12);
  const fd = openSync(path, "r");
  try {
    const read = readSync(fd, buffer, 0, 12, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

function trackedFiles(): string[] {
  // Fails loudly (rather than passing) if git can't be asked.
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
}

describe("nothing private is committed to this public repo", () => {
  const files = trackedFiles();
  const hint = "Move these to Supabase Storage or the shared notes folder, or (for screenshots of public pages) add a reviewed line to ALLOWED_PATHS in lib/repoFiles.static.test.ts";

  it("no private folder, stray look book, or PDF, photo, export or document outside the reviewed paths", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(forbiddenFiles(files), hint).toEqual([]);
  });

  it("no renamed PDF, photo, video or zip-based document outside the reviewed paths", () => {
    const renamed = files.filter((file) => !allowed(file, ALLOWED_PATHS)).filter((file) => {
      try {
        return looksBinaryMedia(head(file));
      } catch {
        return false; // listed but not on disk (a sparse checkout): nothing to read
      }
    });
    expect(renamed, hint).toEqual([]);
  });

  it("the rule itself", () => {
    expect(
      forbiddenFiles([
        "private/lookbook/futprep-draft1/index.html",
        "Private/notes.txt",
        "docs/private/agreement.md",
        "app/PRIVATE/x.ts",
        "lookbook/index.html",
        "docs/futprep-lookbook-draft1/index.html",
        "Futprep Term 2 Plan.pdf",
        "docs/briefs/agreement.docx",
        "exports/ROSTER.CSV",
        "docs/families.tsv",
        "app/lookbook/photo.jpg",
        "app/icon.svg",
        "public/secret-photo.jpg",
        "public/uploads/kid.png",
        "docs/clip.MOV",
        "backup.tar.gz",
        "contacts.vcf",
        "mail.eml",
        // allowed
        "docs/website-must-fix/about.jpg",
        "public/brand/print/logo.pdf",
        "public/favicon.svg",
        "public/sw.js",
        "app/page.tsx",
        "app/lookbook/futprep/route.ts",
        "lib/lookbook/access.ts",
        "docs\\rebrand\\after\\home.png",
        "app/privacy/page.tsx",
      ]),
    ).toEqual([
      "private/lookbook/futprep-draft1/index.html",
      "Private/notes.txt",
      "docs/private/agreement.md",
      "app/PRIVATE/x.ts",
      "lookbook/index.html",
      "docs/futprep-lookbook-draft1/index.html",
      "Futprep Term 2 Plan.pdf",
      "docs/briefs/agreement.docx",
      "exports/ROSTER.CSV",
      "docs/families.tsv",
      "app/lookbook/photo.jpg",
      "app/icon.svg",
      "public/secret-photo.jpg",
      "public/uploads/kid.png",
      "docs/clip.MOV",
      "backup.tar.gz",
      "contacts.vcf",
      "mail.eml",
    ]);
  });

  it("knows a renamed file by its first bytes", () => {
    expect(looksBinaryMedia(Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(looksBinaryMedia(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(looksBinaryMedia(Buffer.from("\x89PNG\r\n\x1a\n", "latin1"))).toBe(true);
    expect(looksBinaryMedia(Buffer.from("PK\x03\x04", "latin1"))).toBe(true);
    expect(looksBinaryMedia(Buffer.from("\0\0\0\x18ftypheic", "latin1"))).toBe(true);
    expect(looksBinaryMedia(Buffer.from("import x from"))).toBe(false);
    expect(looksBinaryMedia(Buffer.from("name,phone\n"))).toBe(false);
  });
});
