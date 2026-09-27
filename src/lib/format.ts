/** Petits outils de mise en forme, utilisables partout. */

export const TIMEZONE = "America/Guadeloupe";

/** "#0B6474" → "rgb(11, 100, 116)" (format demandé par Apple Wallet). */
export function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return "rgb(0, 0, 0)";
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** "Boulangerie du Bourg !" → "boulangerie-du-bourg" */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** Garde uniquement les chiffres et le + ; "0690 12 34 56" → "0690123456". */
export function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

/** Date lisible à l'heure de la Guadeloupe. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIMEZONE, dateStyle: "medium" }).format(new Date(iso));
}

/**
 * Convertit la valeur d'un champ <input type="datetime-local"> (heure de Guadeloupe)
 * en vraie date. La Guadeloupe est toujours à UTC-4 (pas d'heure d'été).
 */
export function guadeloupeLocalToDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const d = new Date(`${value.slice(0, 16)}:00-04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Phrase affichée sur la carte selon l'avancement. */
export function statusSentence(stamps: number, threshold: number, reward: string): string {
  if (stamps >= threshold) return `🎁 Cadeau débloqué : ${reward} ! Montre ta carte en caisse.`;
  const left = threshold - stamps;
  if (stamps === 0) return `0/${threshold} tampon. Prochain cadeau : ${reward}.`;
  if (left <= 2) return `Plus que ${left} tampon${left > 1 ? "s" : ""} avant ton cadeau : ${reward} !`;
  return `Merci pour ta visite ! ${stamps}/${threshold} tampons.`;
}
