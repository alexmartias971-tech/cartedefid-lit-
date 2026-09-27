import "server-only";
import sharp from "sharp";
import type { Business, Program } from "@/lib/types";

/** Télécharge le logo de l'entreprise (s'il existe). */
async function fetchLogo(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
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
