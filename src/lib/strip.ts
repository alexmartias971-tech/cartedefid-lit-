import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import type { Program } from "@/lib/types";

/**
 * Fabrique la grande bannière décorative de la carte (le "strip" Apple / le "hero" Google) :
 * image de décor (ou couleur), voile sombre réglable, et pour le mode tampons,
 * la grille de tampons dessinée avec les icônes choisies.
 */

type StripProgram = Pick<
  Program,
  | "mode"
  | "reward_threshold"
  | "background_color"
  | "stamp_color"
  | "strip_image_url"
  | "stamp_icon_url"
  | "stamp_empty_icon_url"
  | "strip_overlay"
>;

const cache = new Map<string, { at: number; buf: Buffer | null }>();

async function fetchImage(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.buf;
  let buf: Buffer | null = null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) buf = Buffer.from(await res.arrayBuffer());
  } catch {
    buf = null;
  }
  cache.set(url, { at: Date.now(), buf });
  return buf;
}

function defaultStamp(size: number, color: string, filled: boolean, checkColor: string): Buffer {
  const r = size / 2 - size * 0.06;
  const svg = filled
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}"/>
        <path d="M ${size * 0.3} ${size * 0.52} L ${size * 0.45} ${size * 0.66} L ${size * 0.72} ${size * 0.36}"
          fill="none" stroke="${checkColor}" stroke-width="${size * 0.09}" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}" fill-opacity="0.12"
          stroke="${color}" stroke-opacity="0.7" stroke-width="${size * 0.06}" stroke-dasharray="${size * 0.12} ${size * 0.08}"/>
      </svg>`;
  return Buffer.from(svg);
}

/** Taille @1x Apple : 375 × 123. On produit @1x, @2x, @3x. */
export async function renderStrip(program: StripProgram, filledCount: number, scale: 1 | 2 | 3 = 3): Promise<Buffer> {
  const W = 375 * scale;
  const H = 123 * scale;

  // 1. Fond : image de décor recadrée, ou couleur de la carte
  const decor = await fetchImage(program.strip_image_url);
  let base = decor
    ? sharp(decor).resize(W, H, { fit: "cover", position: "centre" })
    : sharp({ create: { width: W, height: H, channels: 4, background: program.background_color || "#0B6474" } });
  let baseBuf = await base.png().toBuffer();

  const layers: OverlayOptions[] = [];

  // 2. Voile sombre pour que les tampons et le texte restent lisibles
  const overlay = Math.max(0, Math.min(80, program.strip_overlay ?? 0));
  if (decor && overlay > 0) {
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000" fill-opacity="${overlay / 100}"/></svg>`,
      ),
      top: 0,
      left: 0,
    });
  }

  // 3. Grille de tampons (mode tampons uniquement)
  if (program.mode === "stamps") {
    const total = Math.max(1, Math.min(50, program.reward_threshold));
    const filled = Math.max(0, Math.min(total, filledCount));
    const rows = total <= 6 ? 1 : total <= 14 ? 2 : 3;
    const cols = Math.ceil(total / rows);
    const padX = 14 * scale;
    const padY = 10 * scale;
    const cell = Math.floor(Math.min((W - 2 * padX) / cols, (H - 2 * padY) / rows));
    const icon = Math.floor(cell * 0.8);
    const gridW = cols * cell;
    const gridH = rows * cell;
    const startX = Math.floor((W - gridW) / 2);
    const startY = Math.floor((H - gridH) / 2);

    const color = program.stamp_color || "#FFFFFF";
    const [fullSrc, emptySrc] = await Promise.all([
      fetchImage(program.stamp_icon_url),
      fetchImage(program.stamp_empty_icon_url),
    ]);

    const toIcon = async (src: Buffer | null, isFilled: boolean): Promise<Buffer> => {
      if (src) {
        let img = sharp(src).resize(icon, icon, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
        // Sans icône "vide" dédiée, on reprend l'icône pleine en transparence
        if (!isFilled && !emptySrc) img = img.ensureAlpha(0.3).linear([1, 1, 1, 0.3], [0, 0, 0, 0]);
        return img.png().toBuffer();
      }
      return sharp(defaultStamp(icon, color, isFilled, program.background_color || "#000000")).png().toBuffer();
    };
    const fullIcon = await toIcon(fullSrc, true);
    const emptyIcon = await toIcon(emptySrc ?? fullSrc, false);

    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      // Dernière ligne centrée si elle est incomplète
      const inRow = row === rows - 1 ? total - cols * (rows - 1) : cols;
      const offset = Math.floor(((cols - inRow) * cell) / 2);
      layers.push({
        input: i < filled ? fullIcon : emptyIcon,
        left: startX + offset + col * cell + Math.floor((cell - icon) / 2),
        top: startY + row * cell + Math.floor((cell - icon) / 2),
      });
    }
  }

  if (layers.length > 0) baseBuf = await sharp(baseBuf).composite(layers).png().toBuffer();
  base = sharp(baseBuf);
  return base.png({ compressionLevel: 9 }).toBuffer();
}
