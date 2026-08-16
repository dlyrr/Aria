//! How light a cover is, region by region — so glass laid over it can decide
//! whether its type should be black or white.
//!
//! The cover is drawn to a small grid once per track and the luma of each
//! cell kept. A pane then asks for the mean over the patch of the cover it
//! sits on, in the cover's own normalised coordinates, and picks its ink from
//! that. Coarse on purpose: the glass blurs everything behind it anyway.

export const LUMA_GRID = 16;

export interface ArtworkLuma {
  /** Row-major, `LUMA_GRID`² cells, each 0–1. */
  cells: Float32Array;
  mean: number;
  /** Natural width / height, for mapping a frame crop back to the picture. */
  aspect: number;
}

const cache = new Map<string, Promise<ArtworkLuma | null>>();

export function artworkLuma(src: string): Promise<ArtworkLuma | null> {
  let hit = cache.get(src);
  if (hit) return hit;
  hit = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const n = LUMA_GRID;
        const canvas = document.createElement("canvas");
        canvas.width = n;
        canvas.height = n;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, n, n);
        const { data } = ctx.getImageData(0, 0, n, n);
        const cells = new Float32Array(n * n);
        let sum = 0;
        for (let i = 0; i < n * n; i++) {
          // Rec. 709 luma on gamma-encoded values: what the eye reads as
          // lightness, near enough, without a linearise/relinearise pass.
          const l = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
          cells[i] = l;
          sum += l;
        }
        resolve({
          cells,
          mean: sum / (n * n),
          aspect: img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1,
        });
      } catch {
        // A cross-origin cover taints the canvas; the pane keeps white ink.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(src, hit);
  // A failed load shouldn't be remembered as the answer.
  hit.then((v) => {
    if (!v) cache.delete(src);
  });
  return hit;
}

/**
 * Mean luma over a patch of the cover, in normalised picture coordinates
 * (0–1 on each axis, clamped). Anything off the picture reads as its edge —
 * the colour field beyond the frame is the same picture blown out.
 */
export function lumaOver(
  luma: ArtworkLuma,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): number {
  const n = LUMA_GRID;
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  const x0 = clamp(Math.floor(Math.min(u0, u1) * n));
  const x1 = clamp(Math.ceil(Math.max(u0, u1) * n) - 1);
  const y0 = clamp(Math.floor(Math.min(v0, v1) * n));
  const y1 = clamp(Math.ceil(Math.max(v0, v1) * n) - 1);
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      sum += luma.cells[y * n + x];
      count++;
    }
  }
  return count ? sum / count : luma.mean;
}
