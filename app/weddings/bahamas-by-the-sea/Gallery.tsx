"use client";

import { useState } from "react";
import type { WeddingGalleryImage } from "@/db/weddingSite";

export function Gallery({ images }: { images: WeddingGalleryImage[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = images.find((image) => image.id === openId) ?? null;

  return (
    <>
      <div className="bws-gallery-grid">
        {images.map((image) => (
          <button type="button" className="bws-gallery-tile" key={image.id} onClick={() => setOpenId(image.id)}>
            <img src={image.imageUrl} alt={image.caption ?? "A Bahamas Weddings By The Sea photo"} loading="lazy" />
            {image.photographerName && <span className="bws-gallery-credit">📷 {image.photographerName}</span>}
          </button>
        ))}
      </div>

      {open && (
        <div className="bws-gallery-lightbox" role="dialog" aria-modal="true" onClick={() => setOpenId(null)}>
          <button type="button" className="bws-gallery-close" aria-label="Close">✕</button>
          <img src={open.imageUrl} alt={open.caption ?? "A Bahamas Weddings By The Sea photo"} onClick={(e) => e.stopPropagation()} />
          {(open.caption || open.photographerName) && (
            <div className="bws-gallery-caption" onClick={(e) => e.stopPropagation()}>
              {open.caption && <p>{open.caption}</p>}
              {open.photographerName && (
                <p className="bws-gallery-credit-line">
                  Photo by {open.photographerUrl ? <a href={open.photographerUrl} target="_blank" rel="noopener noreferrer">{open.photographerName} ↗</a> : open.photographerName}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
