import { ORG_ASSETS_BUCKET } from "@/lib/imageUpload";

// A Wedding Desk package's photo (db/weddingPackages.ts). It shows on the
// bespoke page and, once a package is copied onto Bahamas Weddings By The
// Sea's offerings (202610240001), on its generic listing and its cards on
// /weddings/officiants and /weddings/planning too. So it must be one of
// BWS's own photos, never an outside image or a tracking pixel. Two forms
// are taken, as the admin field's hint says:
//
//  * a photo that ships with the site, in public/weddings/bahamas-by-the-sea/
//  * a photo uploaded for a business, by the public URL the upload routes
//    build (getPublicUrl: {SUPABASE_URL}/storage/v1/object/public/org-assets/org/{id}/...)
//
// Only letters, digits, "-", "_" and "." are allowed in a name, so no
// "..", "?", "#", "%" or "@" can lead the URL anywhere else.
export const SITE_PHOTO_FOLDER = "/weddings/bahamas-by-the-sea/";

const SITE_PHOTO = /^\/weddings\/bahamas-by-the-sea\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:webp|jpe?g|png|avif)$/i;
// What follows `org-assets/`: the business's folder, then what the upload
// routes write there (`{kind}/{uuid}.{ext}`). org-assets takes PNG, JPEG
// and WebP only.
const UPLOADED_PHOTO = /^org\/([1-9][0-9]*)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:webp|jpe?g|png)$/i;

// The photo to save (null for none), and for an upload, the organisation
// whose folder it is in; the caller checks that is BWS. null when the value
// is neither form.
export type PackageImage = { url: string | null; orgFolder: number | null };

export function readPackageImage(value: unknown, supabaseUrl: string | undefined): PackageImage | null {
  if (value === null || value === undefined) return { url: null, orgFolder: null };
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return { url: null, orgFolder: null };
  if (SITE_PHOTO.test(url)) return { url, orgFolder: null };

  const prefix = uploadPrefix(supabaseUrl);
  if (!prefix || !url.startsWith(prefix)) return null;
  const folder = UPLOADED_PHOTO.exec(url.slice(prefix.length));
  return folder ? { url, orgFolder: Number(folder[1]) } : null;
}

// `{origin}/storage/v1/object/public/org-assets/` for our own Supabase
// project, or null when SUPABASE_URL is missing or not a web address.
function uploadPrefix(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const base = new URL(supabaseUrl.trim());
    if (base.protocol !== "https:" && base.protocol !== "http:") return null;
    return `${base.origin}/storage/v1/object/public/${ORG_ASSETS_BUCKET}/`;
  } catch {
    return null;
  }
}
