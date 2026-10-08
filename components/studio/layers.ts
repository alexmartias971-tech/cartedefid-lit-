/**
 * Opérations sur la disposition de la carte (fonctions pures : elles renvoient une nouvelle disposition).
 * Positions : celles de l'iPhone récent (poster) par défaut, et une position propre aux autres formats si on les déplace.
 */
import type { ArtFormat, ArtLayer, CardLayout, Crop } from "@/lib/layout";
import { shapeText } from "@/lib/text-shape";
import { newKey } from "./shared";

const clamp01 = (n: number) => Math.round(Math.min(1.1, Math.max(-0.1, n)) * 10000) / 10000;

export function moveLayer(l: CardLayout, id: string, change: { x?: number; y?: number; size?: number; rot?: number }, fmt: ArtFormat): CardLayout {
  return {
    ...l,
    layers: l.layers.map((x) => {
      if (x.id !== id) return x;
      const rot = change.rot !== undefined ? change.rot : x.rot;
      const pos = {
        ...(change.x !== undefined ? { x: clamp01(change.x) } : {}),
        ...(change.y !== undefined ? { y: clamp01(change.y) } : {}),
        ...(change.size !== undefined ? { size: Math.round(change.size * 100) / 100 } : {}),
      };
      if (fmt === "poster") {
        // Les positions propres aux autres téléphones suivent le même déplacement (et le même agrandissement)
        const dx = pos.x !== undefined ? pos.x - x.x : 0;
        const dy = pos.y !== undefined ? pos.y - x.y : 0;
        const k = pos.size !== undefined && x.size > 0 ? pos.size / x.size : 1;
        const at = x.at
          ? Object.fromEntries(
              Object.entries(x.at).map(([f, p]) => [
                f,
                p ? { x: clamp01(p.x + dx), y: clamp01(p.y + dy), ...(p.size !== undefined ? { size: Math.round(Math.min(100, Math.max(2, p.size * k)) * 100) / 100 } : {}) } : p,
              ]),
            )
          : undefined;
        return { ...x, rot, ...pos, ...(at ? { at } : {}) };
      }
      if (Object.keys(pos).length === 0) return { ...x, rot };
      const cur = x.at?.[fmt] ?? { x: x.x, y: x.y, size: x.size };
      return { ...x, rot, at: { ...x.at, [fmt]: { ...cur, ...pos } } };
    }),
  };
}

/** Centrer horizontalement : sur l'iPhone à jour, sur les 3 téléphones à la fois ; sinon sur ce téléphone seulement. */
export function centerLayer(l: CardLayout, id: string, fmt: ArtFormat): CardLayout {
  if (fmt !== "poster") return moveLayer(l, id, { x: 0.5 }, fmt);
  return {
    ...l,
    layers: l.layers.map((x) =>
      x.id !== id ? x : { ...x, x: 0.5, ...(x.at ? { at: Object.fromEntries(Object.entries(x.at).map(([f, p]) => [f, p ? { ...p, x: 0.5 } : p])) } : {}) },
    ),
  };
}

export const updateLayer = (l: CardLayout, id: string, patch: Partial<ArtLayer>): CardLayout => ({
  ...l,
  layers: l.layers.map((x) => (x.id === id ? { ...x, ...patch } : x)),
});

export const removeLayer = (l: CardLayout, id: string): CardLayout => ({ ...l, layers: l.layers.filter((x) => x.id !== id) });

export function duplicateLayer(l: CardLayout, id: string): { layout: CardLayout; id: string | null } {
  const src = l.layers.find((x) => x.id === id);
  if (!src) return { layout: l, id: null };
  const copy: ArtLayer = { ...src, id: newKey(), x: clamp01(src.x + 0.05), y: clamp01(src.y + 0.05), at: undefined };
  return { layout: { ...l, layers: [...l.layers, copy] }, id: copy.id };
}

export function bringFront(l: CardLayout, id: string): CardLayout {
  const x = l.layers.find((y) => y.id === id);
  return x ? { ...l, layers: [...l.layers.filter((y) => y.id !== id), x] } : l;
}

/** Recaler un calque sur sa position iPhone récent dans ce format. */
export function resetFormat(l: CardLayout, id: string, fmt: ArtFormat): CardLayout {
  if (fmt === "poster") return l;
  return {
    ...l,
    layers: l.layers.map((x) => {
      if (x.id !== id || !x.at) return x;
      const at = { ...x.at };
      delete at[fmt as "apple" | "google"];
      return { ...x, at: Object.keys(at).length ? at : undefined };
    }),
  };
}

/** Logo du commerce en grand sur le visuel (place libre entre le haut de la carte et le QR code). */
export function logoLayer(): ArtLayer {
  return {
    id: newKey(),
    kind: "logo",
    color: "#ffffff",
    bg: null,
    size: 24,
    rot: 0,
    x: 0.5,
    y: 0.33,
    at: { apple: { x: 0.5, y: 0.36, size: 40 }, google: { x: 0.5, y: 0.38, size: 30 } },
  };
}

export function mascotLayer(pose: "wave" | "stamp" | "peek"): ArtLayer {
  return {
    id: newKey(),
    kind: "mascot",
    pose,
    color: "#ffffff",
    bg: null,
    size: pose === "peek" ? 15 : 22,
    rot: 0,
    x: 0.84,
    y: 0.38,
    at: { apple: { x: 0.9, y: 0.34, size: pose === "peek" ? 30 : 52 }, google: { x: 0.85, y: 0.4, size: pose === "peek" ? 22 : 40 } },
  };
}

export function textLayer(n: number): ArtLayer {
  const text = "Votre texte";
  return { id: newKey(), kind: "text", text, font: "moderne", ...shapeText(text, "moderne"), color: "#FFFFFF", bg: null, size: 8, rot: 0, x: 0.5, y: [0.3, 0.38, 0.24, 0.42][n % 4] };
}

export function iconLayer(icon: string, n: number): ArtLayer {
  return { id: newKey(), kind: "icon", icon, color: "#FFFFFF", bg: null, size: 14, rot: 0, x: [0.8, 0.2, 0.84, 0.16][n % 4], y: [0.3, 0.3, 0.4, 0.4][n % 4] };
}

export function setText(l: CardLayout, id: string, text: string, font?: string): CardLayout {
  const layer = l.layers.find((x) => x.id === id);
  if (!layer) return l;
  const f = font ?? layer.font ?? "moderne";
  const shaped = shapeText(text.trim() ? text : "Texte", f);
  // Que des caractères absents de la police (émojis) : on garde un texte de remplacement pour ne pas perdre le calque
  return updateLayer(l, id, { text, font: f, ...(shaped.d ? shaped : shapeText("Texte", f)) });
}

export function setCrop(l: CardLayout, fmt: ArtFormat, crop: Crop | null): CardLayout {
  const next = { ...(l.crop ?? {}) };
  if (crop) next[fmt] = crop;
  else delete next[fmt];
  return { ...l, crop: Object.keys(next).length ? next : undefined };
}

export function setStampsY(l: CardLayout, fmt: ArtFormat, y: number | null): CardLayout {
  const next = { ...(l.stamps ?? {}) };
  if (y === null) delete next[fmt];
  else next[fmt] = Math.round(y * 1000) / 1000;
  return { ...l, stamps: Object.keys(next).length ? next : undefined };
}
