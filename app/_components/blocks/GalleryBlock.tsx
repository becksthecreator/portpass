import Image from "next/image";
import { isOptimisableSrc } from "@/lib/images";

// Block 3 of 8 -- renders only with 3+ real images. This is the fixed-order
// rule made concrete: gallery comes right after Proof, before a single
// price is shown, so a visitor sees the thing before being asked to pay
// for it. An organization with no photography yet (or unconfirmed photo
// consent) simply has no gallery section -- that's correct, not a bug.
//
// Photos go through next/image (speed brief, 29 Sept, 1.5): resized to
// the column they fill and served as AVIF/WebP, so a 700 KB original
// arrives as a few tens of KB. The CSS class still sets the layout, so
// nothing moves.
export function GalleryBlock({ images }: { images: { url: string; alt: string | null }[] }) {
  if (images.length < 3) return null;
  return (
    <section className="tpl-gallery" aria-label="Photos">
      {images.map((image) =>
        isOptimisableSrc(image.url) ? (
          <Image key={image.url} className="tpl-gallery-image" src={image.url} alt={image.alt ?? ""} width={720} height={480} sizes="(max-width: 700px) 50vw, 25vw" loading="lazy" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a host next/image is not configured for
          <img key={image.url} className="tpl-gallery-image" src={image.url} alt={image.alt ?? ""} loading="lazy" />
        ),
      )}
    </section>
  );
}
