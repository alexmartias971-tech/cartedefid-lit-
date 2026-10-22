import "server-only";
import sharp from "sharp";
import { FORMATS, type BannerFormat, type LogoArt } from "@/lib/visual";
import { PHOTO_PNG } from "@/lib/wallet-image-settings";
import {
  cardBannerSvg,
  cardPosterSvg,
  computeCardState,
  designFromProgram,
  googleBannerFormat,
  photoFor,
  stripProgress,
} from "@/lib/card-state";
import type { ArtFormat } from "@/lib/layout";
import type { CardBundle, Program, Tier } from "@/lib/types";

/**
 * Fabrique les images de la carte (bannière Apple, héros Google, poster iOS 27)
 * à partir du même dessin SVG que l'aperçu du tableau de bord.
 * Les photos et le logo sont intégrés dans le SVG (data:) avant la conversion en PNG.
 */

type Embedded = { uri: string; ratio: number } | null;
const cache = new Map<string, { at: number; img: Promise<Embedded> }>();

async function loadEmbedded(url: string, maxWidth: number): Promise<Embedded> {
  try {
    const input = url.startsWith("data:")
      ? Buffer.from(url.slice(url.indexOf(",") + 1), "base64")
      : await fetch(url, { cache: "no-store" }).then(async (res) => (res.ok ? Buffer.from(await res.arrayBuffer()) : null));
    if (!input) return null;
    const meta = await sharp(input).metadata();
    const resized = sharp(input).rotate().resize({ width: maxWidth, withoutEnlargement: true });
    // JPEG pour les photos (léger et rapide), PNG si l'image a de la transparence (logos)
    const { data: buf, info } = meta.hasAlpha
      ? await resized.png().toBuffer({ resolveWithObject: true })
      : await resized.jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
    return { uri: `data:image/${meta.hasAlpha ? "png" : "jpeg"};base64,${buf.toString("base64")}`, ratio: info.width / Math.max(1, info.height) };
  } catch {
    return null;
  }
}

/**
 * Télécharge une image et la renvoie en data: (avec son format largeur / hauteur).
 * L'image n'est pas recadrée : le dessin part exactement de la même image que l'aperçu de l'éditeur.
 * Les demandes simultanées pour la même photo partagent UN seul téléchargement (avant : 1 par taille d'image).
 */
function embed(url: string | null, maxWidth = 1400): Promise<Embedded> {
  if (!url) return Promise.resolve(null);
  const key = `${url}|${maxWidth}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.img;
  const img = loadEmbedded(url, maxWidth);
  cache.set(key, { at: Date.now(), img });
  // Un échec (réseau) n'est pas gardé : on réessaiera à la prochaine demande
  void img.then((v) => {
    if (!v && cache.get(key)?.img === img) cache.delete(key);
  });
  // Mémoire bornée : on oublie les plus anciennes photos
  while (cache.size > 48) cache.delete(cache.keys().next().value as string);
  return img;
}

async function svgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  // Palette optimisée (réglage dans wallet-image-settings.ts) : images 3 à 4 fois plus légères
  return sharp(Buffer.from(svg)).resize(width, height).png(PHOTO_PNG).toBuffer();
}

/** Le logo n'est utile au dessin que s'il est posé sur le visuel ou utilisé comme tampon. */
function needsLogo(program: Program): boolean {
  const layout = designFromProgram(program).layout;
  return layout.look === "logo" || layout.layers.some((l) => l.kind === "logo");
}

async function logoArt(program: Program, logoUrl: string | null | undefined): Promise<LogoArt | null> {
  if (!logoUrl || !needsLogo(program)) return null;
  const logo = await embed(logoUrl, 600);
  return logo ? { href: logo.uri, ratio: logo.ratio } : null;
}

export async function renderStripFor(
  program: Program,
  progress: { total: number; filled: number },
  scale: 1 | 2 | 3 = 3,
  format: BannerFormat = "apple",
  tier: Tier | null = null,
  logoUrl: string | null = null,
): Promise<Buffer> {
  const design = designFromProgram(program);
  // Une photo de niveau n'a pas été recadrée : le cadrage réglé pour la photo principale ne s'y applique pas
  if (tier?.image_url) design.layout = { ...design.layout, crop: undefined };
  // Carte pas encore enregistrée avec l'éditeur v2, ou ancien style dessiné : le bandeau Google garde l'ancien format 3:1
  const fmt: BannerFormat = format === "google" ? googleBannerFormat(design) : format;
  const [decor, icon, iconEmpty, logo] = await Promise.all([
    embed(photoFor(program, tier, format as ArtFormat)),
    embed(design.stampIconUrl, 300),
    embed(design.stampEmptyIconUrl, 300),
    logoArt(program, logoUrl),
  ]);
  const { w, h } = FORMATS[fmt];
  // Google : 1032 × 812 px (format recommandé, ≈ 5:4), ou 1032 × 336 (ancien). Apple : 375 × 144 points × 1, 2 ou 3.
  const W = fmt === "apple" ? w * scale : 1032;
  const H = fmt === "apple" ? h * scale : fmt === "google" ? 812 : 336;
  return svgToPng(
    cardBannerSvg(design, progress, fmt, W, H, "s", {
      decor: decor?.uri ?? null,
      icon: icon?.uri ?? null,
      iconEmpty: iconEmpty?.uri ?? null,
      logo,
      photoRatio: decor?.ratio ?? null,
    }),
    W,
    H,
  );
}

/**
 * Bannière (SVG) pour une page web : les images restent des adresses (le navigateur les charge),
 * mais on connaît leur format pour appliquer le cadrage et poser le logo comme sur la vraie carte.
 */
export async function bannerSvgFor(
  program: Program,
  logoUrl: string | null,
  progress: { total: number; filled: number },
  format: BannerFormat,
  width: number,
  height: number,
): Promise<string> {
  const design = designFromProgram(program);
  const photoUrl = photoFor(program, null, format as ArtFormat);
  const wantsLogo = !!logoUrl && needsLogo(program);
  const [photo, logo] = await Promise.all([embed(photoUrl), wantsLogo ? embed(logoUrl, 600) : Promise.resolve(null)]);
  return cardBannerSvg(design, progress, format, width, height, "signup", {
    decor: photoUrl,
    photoRatio: photo?.ratio ?? null,
    logo: logo ? { href: logo.uri, ratio: logo.ratio } : null,
  });
}

function stateOf(bundle: CardBundle) {
  const state = computeCardState(bundle.program, bundle.card, bundle.tiers, bundle.catalog);
  const progress = stripProgress(bundle.program.mode, state, bundle.card, bundle.catalog);
  // La couleur du niveau (Argent, Or…) remplace la couleur de fond, comme sur la carte
  const program = state.tier?.color ? { ...bundle.program, background_color: state.tier.color } : bundle.program;
  return { state, progress, program };
}

/** Bannière d'une carte client (Apple 375×144 × scale, ou image héros Google 1032×812). */
export async function renderCardStrip(bundle: CardBundle, scale: 1 | 2 | 3 = 3, format: BannerFormat = "apple"): Promise<Buffer> {
  const { state, progress, program } = stateOf(bundle);
  return renderStripFor(program, progress, scale, format, state.tier, bundle.business.logo_url);
}

/** Visuel plein format de la carte poster iOS 27 (358×448 × scale). */
export async function renderCardPoster(bundle: CardBundle, scale: 1 | 2 | 3 = 3): Promise<Buffer> {
  const { state, program, progress } = stateOf(bundle);
  const design = designFromProgram(program);
  if (state.tier?.image_url) design.layout = { ...design.layout, crop: undefined };
  const [photo, logo] = await Promise.all([embed(photoFor(program, state.tier, "poster"), 1600), logoArt(program, bundle.business.logo_url)]);
  const { w, h } = FORMATS.poster;
  return svgToPng(
    cardPosterSvg(design, w * scale, h * scale, "p", photo?.uri ?? null, progress, { logo, photoRatio: photo?.ratio ?? null }),
    w * scale,
    h * scale,
  );
}
