import { FONT_DATA } from "@/lib/fonts";

/** Hauteur d'une ligne (unités de police, 1000 par em). */
const LINE = 1180;

export const FONT_CHOICES = Object.entries(FONT_DATA).map(([id, f]) => ({ id, label: f.label }));

/**
 * Transforme un texte en dessin (tracé SVG) avec l'une des polices de l'éditeur.
 * Texte centré, jusqu'à 3 lignes. Les caractères absents de la police sont ignorés.
 * Résultat en unités de police (y vers le haut) : prêt à être enregistré dans la disposition de la carte.
 */
export function shapeText(text: string, fontId: string): { d: string; w: number; cy: number; cap: number; hb: number } {
  const font = FONT_DATA[fontId] ?? FONT_DATA.moderne;
  const space = font.g[" "]?.[0] ?? 250;
  const lines = text.replace(/\r/g, "").split("\n").slice(0, 3);
  const widths = lines.map((line) => [...line].reduce((sum, ch) => sum + (font.g[ch]?.[0] ?? (ch === " " ? space : 0)), 0));
  const w = Math.max(1, ...widths);
  let d = "";
  lines.forEach((line, i) => {
    let x = Math.round((w - widths[i]) / 2);
    const y = -i * LINE;
    for (const ch of line) {
      const glyph = font.g[ch];
      if (!glyph) {
        if (ch === " ") x += space;
        continue;
      }
      const [advance, path] = glyph;
      if (path) d += path.replace(/(-?\d+) (-?\d+)/g, (_, gx: string, gy: string) => `${Number(gx) + x} ${Number(gy) + y}`);
      x += advance;
    }
  });
  const n = lines.length;
  const hb = font.cap + (n - 1) * LINE;
  return { d, w, cy: (font.cap - (n - 1) * LINE) / 2, cap: font.cap, hb };
}
