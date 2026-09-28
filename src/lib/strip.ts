import "server-only";
import sharp from "sharp";
import { FORMATS, type BannerFormat } from "@/lib/visual";
import {
  cardBannerSvg,
  cardPosterSvg,
  computeCardState,
  designFromProgram,
  photoFor,
  stripProgress,
} from "@/lib/card-state";
import type { CardBundle, Program, Tier } from "@/lib/types";

/**
 * Fabrique les images de la carte (bannière Apple, héros Google, poster iOS 27)
 * à partir du même dessin SVG que l'aperçu du tableau de bord.
 * Les photos sont intégrées dans le SVG (data:) avant la conversion en PNG.
 */

const cache = new Map<string, { at: number; uri: string | null }>();

async function toDataUri(url: string | null, maxWidth = 1400): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  const key = `${url}|${maxWidth}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.uri;
  let uri: string | null = null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const input = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(input).metadata();
      const img = sharp(input).rotate().resize({ width: maxWidth, withoutEnlargement: true });
      // JPEG pour les photos (léger et rapide), PNG si l'image a de la transparence
      const buf = meta.hasAlpha ? await img.png().toBuffer() : await img.jpeg({ quality: 88 }).toBuffer();
      uri = `data:image/${meta.hasAlpha ? "png" : "jpeg"};base64,${buf.toString("base64")}`;
    }
  } catch {
    uri = null;
  }
  cache.set(key, { at: Date.now(), uri });
  return uri;
}

async function svgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  // Palette optimisée : images 3 à 4 fois plus légères (le fichier .pkpass reste rapide à télécharger)
  return sharp(Buffer.from(svg)).resize(width, height).png({ palette: true, quality: 92, effort: 8, compressionLevel: 9 }).toBuffer();
}

export async function renderStripFor(
  program: Program,
  progress: { total: number; filled: number },
  scale: 1 | 2 | 3 = 3,
  format: BannerFormat = "apple",
  tier: Tier | null = null,
): Promise<Buffer> {
  const design = designFromProgram(program);
  const [decor, icon, iconEmpty] = await Promise.all([
    toDataUri(photoFor(program, tier)),
    toDataUri(design.stampIconUrl, 300),
    toDataUri(design.stampEmptyIconUrl, 300),
  ]);
  const { w, h } = FORMATS[format];
  // Google : 1032 × 336 px (format officiel). Apple : 375 × 144 points × 1, 2 ou 3.
  const W = format === "google" ? 1032 : w * scale;
  const H = format === "google" ? 336 : h * scale;
  return svgToPng(cardBannerSvg(design, progress, format, W, H, "s", { decor, icon, iconEmpty }), W, H);
}

function stateOf(bundle: CardBundle) {
  const state = computeCardState(bundle.program, bundle.card, bundle.tiers, bundle.catalog);
  const progress = stripProgress(bundle.program.mode, state, bundle.card, bundle.catalog);
  // La couleur du niveau (Argent, Or…) remplace la couleur de fond, comme sur la carte
  const program = state.tier?.color ? { ...bundle.program, background_color: state.tier.color } : bundle.program;
  return { state, progress, program };
}

/** Bannière d'une carte client (Apple 375×144 × scale, ou Google 1032×336). */
export async function renderCardStrip(bundle: CardBundle, scale: 1 | 2 | 3 = 3, format: BannerFormat = "apple"): Promise<Buffer> {
  const { state, progress, program } = stateOf(bundle);
  return renderStripFor(program, progress, scale, format, state.tier);
}

/** Visuel plein format de la carte poster iOS 27 (358×448 × scale). */
export async function renderCardPoster(bundle: CardBundle, scale: 1 | 2 | 3 = 3): Promise<Buffer> {
  const { state, program, progress } = stateOf(bundle);
  const design = designFromProgram(program);
  const photo = await toDataUri(photoFor(program, state.tier), 1600);
  const { w, h } = FORMATS.poster;
  return svgToPng(cardPosterSvg(design, w * scale, h * scale, "p", photo, progress), w * scale, h * scale);
}
