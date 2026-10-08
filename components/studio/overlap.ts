/**
 * Un élément posé sur les tampons ou sur le QR code ? Vérifié sur les 3 téléphones (la carte doit rester lisible partout).
 * Fonctions pures, partagées par l'éditeur (avertissements) et par les déplacements (pour ne pas créer le problème ailleurs).
 */
import type { ArtFormat, ArtLayer, CardLayout } from "@/lib/layout";
import { FORMATS, layerBox, stampsBox } from "@/lib/visual";
import type { Draft } from "./state";

type Box = { x: number; y: number; w: number; h: number };

/** Zone du QR code sur la carte iPhone récente (en points du visuel 358 × 448). */
const QR_POSTER: Box = { x: 124, y: 211, w: 110, h: 110 };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const FORMAT_NAMES: Record<ArtFormat, string> = { poster: "l'iPhone à jour", apple: "l'ancien iPhone", google: "Android" };
const ALL: ArtFormat[] = ["poster", "apple", "google"];

/** Ancien style dessiné (grille, collection, remplissage) : bandeau Android 3:1 et pas de bande de tampons déplaçable. */
export const isDrawnStyle = (d: Pick<Draft, "mode" | "progress_style">) =>
  d.mode !== "cashback" && !["glass", "minimal", "track", "none"].includes(d.progress_style);

export type Conflict = { fmt: ArtFormat; what: "stamps" | "qr" };

/** Ce que cache ce calque sur ce téléphone (null = rien). */
export function conflictOn(d: Draft, layer: ArtLayer, fmt: ArtFormat, logoRatio: number | null, layout: CardLayout = d.layout): Conflict | null {
  const drawn = isDrawnStyle(d) && fmt !== "poster";
  const { w: W, h: H } = FORMATS[drawn && fmt === "google" ? "googleLegacy" : fmt];
  const b = layerBox(layer, fmt, W, H, { logo: layer.kind === "logo" ? { href: "", ratio: logoRatio ?? 1 } : null });
  const box = { x: b.cx - b.w / 2, y: b.cy - b.h / 2, w: b.w, h: b.h };
  const band =
    d.mode !== "cashback" && !drawn
      ? stampsBox(
          {
            photo: null,
            focus: "center",
            brand: d.background_color,
            accent: d.stamp_color,
            darken: 0,
            style: d.progress_style === "minimal" || d.progress_style === "track" || d.progress_style === "none" ? d.progress_style : "glass",
            total: d.mode === "stamps" ? d.reward_threshold : 10,
            filled: 0,
            icons: [],
            rewardOnLast: false,
            gauge: d.mode === "points",
            stampsY: layout.stamps?.[fmt] ?? null,
          },
          fmt,
        )
      : null;
  if (band && overlaps(box, band)) return { fmt, what: "stamps" };
  if (fmt === "poster" && overlaps(box, QR_POSTER)) return { fmt, what: "qr" };
  return null;
}

/** Problèmes de ce calque sur les 3 téléphones, celui affiché en premier. */
export function conflicts(d: Draft, layer: ArtLayer | null, logoRatio: number | null, current: ArtFormat = "poster"): Conflict[] {
  if (!layer) return [];
  const order = [current, ...ALL.filter((f) => f !== current)];
  return order.map((f) => conflictOn(d, layer, f, logoRatio)).filter((c): c is Conflict => c !== null);
}

export function conflictMessage(c: Conflict, current: ArtFormat, subject = "Cet élément"): string {
  const where = c.fmt === current ? "" : ` sur ${FORMAT_NAMES[c.fmt]}`;
  return c.what === "stamps"
    ? `${subject} cache une partie des tampons${where} : déplacez-le pour que vos clients voient leur progression.`
    : `${subject} passe derrière le QR code${where} : déplacez-le, il serait caché.`;
}

/** Nom d'un calque pour un message (« Le logo cache… »). */
export const layerName = (l: ArtLayer) => (l.kind === "logo" ? "Le logo" : l.kind === "mascot" ? "Walty" : l.kind === "text" ? "Un texte ajouté" : "Un autocollant");

/**
 * Après un changement fait sur l'iPhone à jour (qui entraîne les autres téléphones) : si un calque arrive
 * sur les tampons d'un autre téléphone alors qu'il ne les cachait pas, il garde sa place d'avant sur ce téléphone.
 */
export function keepOthersClear(d: Draft, before: CardLayout, after: CardLayout, logoRatio: number | null): CardLayout {
  let changed = false;
  const layers = after.layers.map((l) => {
    const old = before.layers.find((x) => x.id === l.id);
    if (!old || (old.x === l.x && old.y === l.y && old.size === l.size)) return l;
    let at = l.at;
    for (const fmt of ["apple", "google"] as const) {
      const now = conflictOn(d, l, fmt, logoRatio, after);
      if (now?.what !== "stamps" || conflictOn(d, old, fmt, logoRatio, before)) continue;
      const keep = old.at?.[fmt] ?? { x: old.x, y: old.y, size: old.size };
      at = { ...at, [fmt]: keep };
      changed = true;
    }
    return at === l.at ? l : { ...l, at };
  });
  return changed ? { ...after, layers } : after;
}
