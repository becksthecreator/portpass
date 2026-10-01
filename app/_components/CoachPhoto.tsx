"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// A team member's photo that falls back to their initials when the file
// can't be loaded (a photo URL typed on the Team page that points nowhere,
// or a file that was removed). Without this the public coaches page and the
// Futprep home grid show the browser's broken-image icon.
//
// The image can fail before React has hydrated, in which case onError never
// fires; the effect checks for that once on mount.
export function CoachPhoto({
  src,
  alt,
  fallback,
  loading,
  width,
  height,
}: {
  src: string;
  alt: string;
  fallback: ReactNode;
  loading?: "lazy" | "eager";
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <>{fallback}</>;
  return <img ref={ref} src={src} alt={alt} loading={loading} width={width} height={height} onError={() => setFailed(true)} />;
}
