// Block 3 of 8 -- renders only with 3+ real images. This is the fixed-order
// rule made concrete: gallery comes right after Proof, before a single
// price is shown, so a visitor sees the thing before being asked to pay
// for it. An organization with no photography yet (or unconfirmed photo
// consent) simply has no gallery section -- that's correct, not a bug.
export function GalleryBlock({ images }: { images: { url: string; alt: string | null }[] }) {
  if (images.length < 3) return null;
  return (
    <section className="tpl-gallery" aria-label="Photos">
      {images.map((image) => (
        <img key={image.url} className="tpl-gallery-image" src={image.url} alt={image.alt ?? ""} loading="lazy" />
      ))}
    </section>
  );
}
