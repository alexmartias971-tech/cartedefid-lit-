import "server-only";
import sharp from "sharp";
import { FONT_DATA } from "@/lib/fonts";
import { shapeText } from "@/lib/text-shape";
import type { Business, Program } from "@/lib/types";

/**
 * Retire les marges transparentes autour d'un logo (il paraît plus grand et plus lisible).
 * Un logo posé sur un fond de couleur (coin opaque) est gardé tel quel, avec son fond.
 */
async function trimTransparent(raw: Buffer): Promise<Buffer> {
  try {
    const meta = await sharp(raw).metadata();
    if (!meta.hasAlpha) return raw;
    const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: c } = info;
    const alpha = (x: number, y: number) => data[(y * w + x) * c + c - 1];
    if (alpha(0, 0) > 16 || alpha(w - 1, 0) > 16 || alpha(0, h - 1) > 16 || alpha(w - 1, h - 1) > 16) return raw;
    let [x0, y0, x1, y1] = [w, h, -1, -1];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (alpha(x, y) > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return raw;
    // Même petite marge que le recadrage fait dans l'éditeur (l'aperçu et la carte partent de la même image)
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
    const left = Math.max(0, x0 - pad);
    const top = Math.max(0, y0 - pad);
    const width = Math.min(w, x1 + pad + 1) - left;
    const height = Math.min(h, y1 + pad + 1) - top;
    if (width >= w - 4 && height >= h - 4) return raw;
    return await sharp(raw).extract({ left, top, width, height }).png().toBuffer();
  } catch {
    return raw;
  }
}

/** Télécharge le logo de l'entreprise (s'il existe), sans les marges transparentes autour. */
async function fetchLogo(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await trimTransparent(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

function escapeXml(text: string) {
  return text.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}

/** Icône carrée de secours : la première lettre du commerce sur la couleur de la carte. */
async function letterIcon(business: Business, program: Program | null, size: number): Promise<Buffer> {
  const bg = program?.background_color ?? "#0B6474";
  const fg = program?.foreground_color ?? "#FFFFFF";
  const letter = escapeXml((business.name.trim()[0] ?? "?").toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" rx="${size * 0.22}" fill="${bg}"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
      font-weight="700" font-size="${size * 0.55}" fill="${fg}">${letter}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Icône carrée (Apple : icon.png 29px / 58px / 87px ; Google : logo du programme). */
export async function squareLogoPng(business: Business, program: Program | null, size: number): Promise<Buffer> {
  const source = await fetchLogo(business.logo_url);
  if (source) {
    try {
      return await sharp(source)
        .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();
    } catch {
      // Logo illisible : on utilise l'icône de secours
    }
  }
  return letterIcon(business, program, size);
}

/** Logo rectangulaire affiché en haut à gauche de la carte Apple (max 160×50 px en @1x). */
export async function wideLogoPng(business: Business, program: Program | null, scale: 1 | 2 | 3): Promise<Buffer> {
  const source = await fetchLogo(business.logo_url);
  if (source) {
    try {
      return await sharp(source)
        .resize(160 * scale, 50 * scale, { fit: "inside", withoutEnlargement: false })
        .png()
        .toBuffer();
    } catch {
      // on continue avec l'icône de secours
    }
  }
  return letterIcon(business, program, 50 * scale);
}

/** Logo de la carte « poster » iOS 27 : 30 points de haut, 30 à 126 de large. Rien si pas de logo. */
export async function primaryLogoPng(business: Business, scale: 1 | 2 | 3): Promise<Buffer | null> {
  const source = await fetchLogo(business.logo_url);
  if (!source) return null;
  try {
    return await sharp(source)
      .resize(126 * scale, 30 * scale, { fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/** Le nom du commerce écrit en image, à la couleur des textes de la carte (pas de police à installer : tracés intégrés). */
async function nameImage(business: Business, program: Program | null, maxW: number, H: number): Promise<Buffer> {
  // Lettres absentes de la police (ò, émojis…) : remplacées par la lettre sans accent, ou retirées
  const glyphs = FONT_DATA.moderne.g;
  let name = [...(business.name.trim().slice(0, 40) || "?")]
    .map((ch) => (glyphs[ch] || ch === " " ? ch : glyphs[ch.normalize("NFD")[0]] ? ch.normalize("NFD")[0] : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim() || "?";
  // Nom long : sur 2 lignes (coupé à l'espace le plus proche du milieu) pour rester lisible
  if (name.length > 14 && name.includes(" ")) {
    const mid = name.length / 2;
    let cut = -1;
    for (let i = 0; i < name.length; i++) if (name[i] === " " && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    name = `${name.slice(0, cut)}\n${name.slice(cut + 1)}`;
  }
  const s = shapeText(name, "moderne");
  const top = s.cap * 1.12;
  const bottom = s.hb - s.cap + s.cap * 0.3;
  const vbW = s.w + s.cap * 0.1;
  const vbH = top + bottom;
  const W = Math.max(1, Math.min(maxW, Math.round((H * vbW) / vbH)));
  const fg = program?.foreground_color ?? "#FFFFFF";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${-s.cap * 0.05} ${-top} ${vbW} ${vbH}" preserveAspectRatio="xMinYMid meet"><path d="${s.d}" fill="${fg}" transform="scale(1 -1)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Haut de la carte iPhone iOS 27 sans logo : le nom du commerce en image (30 pt de haut, 126 pt de large au maximum). */
export async function primaryNamePng(business: Business, program: Program | null, scale: 1 | 2 | 3): Promise<Buffer> {
  return nameImage(business, program, 126 * scale, 30 * scale);
}

/**
 * Logo de la carte Android (660 × 660) : Google le découpe en rond. On le pose sur un fond plein
 * (couleur de la carte) avec 15 % de marge, comme le demandent les consignes de Google.
 */
export async function googleLogoPng(business: Business, program: Program | null): Promise<Buffer> {
  const source = await fetchLogo(business.logo_url);
  if (!source) return letterIcon(business, program, 660);
  try {
    const inner = await sharp(source).resize(462, 462, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const bg = program?.background_color ?? "#FFFFFF";
    return await sharp({ create: { width: 660, height: 660, channels: 4, background: bg } })
      .composite([{ input: inner, gravity: "center" }])
      .png()
      .toBuffer();
  } catch {
    return letterIcon(business, program, 660);
  }
}

/** Logo large Android (1280 × 400, fond transparent) : il remplace le logo rond ET le nom en haut de la carte. */
export async function googleWideLogoPng(business: Business): Promise<Buffer | null> {
  const source = await fetchLogo(business.logo_url);
  if (!source) return null;
  try {
    const inner = await sharp(source).resize(1180, 340, { fit: "inside" }).png().toBuffer();
    return await sharp({ create: { width: 1280, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: inner, gravity: "center" }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
