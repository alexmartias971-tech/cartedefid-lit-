"use client";

import { useEffect, useState } from "react";

/** Format (largeur / hauteur) d'une image, une fois chargée. null tant qu'on ne le connaît pas. */
export function useImageRatio(url: string | null | undefined): number | null {
  const [ratio, setRatio] = useState<{ url: string; r: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive && img.naturalHeight > 0) setRatio({ url, r: img.naturalWidth / img.naturalHeight });
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return url && ratio?.url === url ? ratio.r : null;
}
