import { createHash } from "node:crypto";
import { cardBannerSvg, cardPosterSvg, designFromProgram } from "@/lib/card-state";
import { LINE_ICONS } from "@/lib/visual";
import type { Program } from "@/lib/types";

/**
 * Empreinte du MOTEUR DE DESSIN des cartes (visual.ts, art.ts, mascot.ts, card-state.ts).
 * On dessine une série de cartes d'essai (tous les styles, tous les calques) et on garde une empreinte du résultat.
 * Si quelqu'un modifie le dessin des cartes, l'empreinte change toute seule et les images en cache
 * sont refaites : pas besoin de penser à « vider le cache » après une retouche du design.
 * (Rien à télécharger : c'est du texte SVG, calculé une seule fois au démarrage, en ~1 ms.)
 */
let cached: string | null = null;

const STYLES: Program["progress_style"][] = ["glass", "minimal", "track", "none", "grid", "collection", "fill"];

export function renderFingerprint(): string {
  if (cached) return cached;
  const icon = Object.keys(LINE_ICONS)[0] ?? "check";
  const layout = {
    look: "icons",
    layers: [
      { id: "t", kind: "text", text: "Aa", font: "moderne", d: "M0 0L500 0L500 700L0 700Z", w: 500, cy: 350, cap: 700, hb: 700, color: "#ffffff", bg: "#000000", size: 12, rot: 3, x: 0.3, y: 0.7 },
      { id: "i", kind: "icon", icon, color: "#ffcc00", bg: "#222222", size: 14, rot: 0, x: 0.8, y: 0.2 },
      { id: "l", kind: "logo", color: "#ffffff", bg: null, size: 12, rot: 0, x: 0.2, y: 0.2 },
      { id: "m", kind: "mascot", pose: "wave", color: "#ffffff", bg: null, size: 30, rot: 0, x: 0.85, y: 0.75 },
    ],
    stamps: { apple: 0.7, google: 0.7, poster: 0.2 },
    crop: { apple: { x: 0.4, y: 0.5, zoom: 1.2 }, poster: { x: 0.5, y: 0.4, zoom: 1.1 } },
  };
  const base = {
    id: "fingerprint", name: "Essai", mode: "stamps", background_color: "#140d25", foreground_color: "#ffffff", label_color: "#ffc46e",
    stamp_color: "#ff6a26", strip_overlay: 20, strip_image_url: "https://example.invalid/photo.jpg", stamp_icon_url: null,
    stamp_empty_icon_url: null, decor_preset: "beach", photo_focus: "center", stamps_position: "bottom", icon_preset: "coffee",
    collection_icons: [], vessel: "glass", fill_color: "#8FD16A", reward_on_last: true, show_logo_text: true,
    label_balance: null, label_customer: null, label_reward: null, card_layout: layout,
  } as unknown as Program;
  const assets = { logo: { href: "data:image/png;base64,AA==", ratio: 2 }, photoRatio: 1.5 };
  const parts: string[] = [];
  for (const style of STYLES) {
    for (const mode of ["stamps", "points", "cashback"] as const) {
      const design = designFromProgram({ ...base, progress_style: style, mode });
      const progress = { total: 10, filled: 4, streak: { count: 2, goal: 4 } };
      parts.push(cardBannerSvg(design, progress, "apple", 750, 288, "s", { decor: "data:image/jpeg;base64,AA==", ...assets }));
      parts.push(cardBannerSvg(design, progress, "google", 1032, 812, "s", { decor: "data:image/jpeg;base64,AA==", ...assets }));
      parts.push(cardPosterSvg(design, 716, 896, "p", "data:image/jpeg;base64,AA==", progress, assets));
    }
  }
  cached = createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 12);
  return cached;
}
