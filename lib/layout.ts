/**
 * Disposition de la carte choisie dans l'éditeur visuel (colonne `card_layout` des programmes).
 *
 *  - `slots`  : ce qui s'affiche dans chaque zone de texte imposée par Apple et Google
 *               (en haut à droite, les 4 champs du bas, la ligne de pied).
 *  - `layers` : textes et stickers posés librement sur la photo, comme sur Canva.
 *  - `stamps` : hauteur de la bande de tampons sur la photo (0 = tout en haut, 1 = tout en bas).
 *  - `bg`     : visuel de fond propre à un téléphone (sinon la photo principale, recadrée automatiquement).
 *  - `crop`   : cadrage de la photo pour chaque téléphone (point visé + zoom).
 *  - `look`   : aspect des tampons (tampon classique, logo du commerce, icônes).
 *  - `topLogo`: petit logo officiel en haut de la carte (false = masqué).
 *
 * Une carte sans disposition enregistrée garde exactement l'affichage d'avant.
 * Fichier sans dépendance : utilisé par l'éditeur (navigateur) et par la fabrication des cartes (serveur).
 */

export type SlotKey = "top" | "b1" | "b2" | "b3" | "b4" | "foot";
export const FIELD_SLOTS = ["top", "b1", "b2", "b3", "b4"] as const;
export type FieldSlot = (typeof FIELD_SLOTS)[number];

export type SlotSource =
  | "balance"
  | "remaining"
  | "customer"
  | "reward"
  | "tier"
  | "streak"
  | "lap"
  | "rank"
  | "offers"
  | "custom"
  | "none";
export type FootSource = "sentence" | "custom" | "none";

export type SlotConfig = { src: SlotSource; label?: string; value?: string };
export type FootConfig = { src: FootSource; value?: string };

export type ArtFormat = "poster" | "apple" | "google";
export const ART_FORMATS = ["poster", "apple", "google"] as const;
export type LayerPos = { x: number; y: number; size?: number };

/** Ce qu'on peut poser sur le visuel : un texte, un dessin, le logo du commerce, la mascotte Walty. */
export type LayerKind = "text" | "icon" | "logo" | "mascot";
export const MASCOT_POSES = ["wave", "stamp", "peek"] as const;

/** Aspect des cases de tampons. */
export type StampLook = "classic" | "logo" | "icons";
export const STAMP_LOOKS = ["classic", "logo", "icons"] as const;

/** Fonds prêts à l'emploi quand il n'y a pas de photo (dégradés doux tirés des couleurs de la carte). */
export const FILLS = ["aurore", "halo", "soleil", "uni"] as const;
export type Fill = (typeof FILLS)[number];

/** Cadrage d'une photo : point visé (0 → 1 sur chaque axe) et zoom (1 = la photo remplit juste le cadre). */
export type Crop = { x: number; y: number; zoom: number };

export type ArtLayer = {
  id: string;
  kind: LayerKind;
  /** Texte tel que tapé (les tracés `d` sont calculés par l'éditeur avec la police choisie). */
  text?: string;
  font?: string;
  /** Tracé du texte (unités de police, 1000 par em, y vers le haut), largeur et centre. */
  d?: string;
  w?: number;
  cy?: number;
  cap?: number;
  hb?: number;
  /** Icône (identifiant de LINE_ICONS). */
  icon?: string;
  /** Pose de la mascotte Walty. */
  pose?: (typeof MASCOT_POSES)[number];
  color: string;
  /** Fond derrière le texte (pastille) ou l'icône (rond). null = aucun. */
  bg?: string | null;
  /** Taille en % du plus petit côté de l'image (hauteur des majuscules pour un texte, diamètre pour une icône, hauteur pour le logo et la mascotte). */
  size: number;
  /** Rotation en degrés. */
  rot: number;
  /** Position du centre sur la carte iPhone récente (0 → 1). */
  x: number;
  y: number;
  /** Position propre aux autres formats (sinon la même que sur l'iPhone récent). */
  at?: Partial<Record<"apple" | "google", LayerPos>>;
};

export type CardLayout = {
  slots?: Partial<Record<FieldSlot, SlotConfig>> & { foot?: FootConfig };
  layers: ArtLayer[];
  stamps?: Partial<Record<ArtFormat, number>>;
  bg?: Partial<Record<ArtFormat, string>>;
  crop?: Partial<Record<ArtFormat, Crop>>;
  look?: StampLook;
  topLogo?: boolean;
  /** Modèle de métier choisi dans l'éditeur (café, boulangerie…). */
  trade?: string;
  /** Fond sans photo (absent = l'ancien dégradé simple). */
  fill?: Fill;
};

export const EMPTY_LAYOUT: CardLayout = { layers: [] };

/** Informations disponibles pour chaque zone (libellés de l'éditeur). */
export const SLOT_SOURCES: { src: SlotSource; label: string; hint: string; needs?: "tiers" | "streak" | "lap" }[] = [
  { src: "remaining", label: "Progression (conseillé)", hint: "« 3/10 » au début, puis « ENCORE 2 passages » près du cadeau" },
  { src: "balance", label: "Compteur", hint: "Les tampons, points ou la cagnotte (3/10, 120…)" },
  { src: "customer", label: "Prénom", hint: "Le prénom du client" },
  { src: "reward", label: "Cadeau", hint: "Le cadeau à gagner (ou le prochain cadeau, ou le taux de cashback)" },
  { src: "tier", label: "Niveau", hint: "Bronze, Argent, Or…", needs: "tiers" },
  { src: "streak", label: "Série", hint: "Semaines d'affilée 🔥", needs: "streak" },
  { src: "lap", label: "Record", hint: "Meilleur temps", needs: "lap" },
  { src: "rank", label: "Classement", hint: "P1, P2…", needs: "lap" },
  { src: "offers", label: "Offres", hint: "Nombre d'offres à utiliser" },
  { src: "custom", label: "Texte libre", hint: "Un titre et un texte que tu écris" },
  { src: "none", label: "Vide", hint: "Rien dans cette zone" },
];

/** Zones par défaut, proches de l'affichage automatique d'avant. */
export function defaultSlots(features: { tiers: boolean; streak: boolean; lap: boolean }): NonNullable<CardLayout["slots"]> {
  const top: SlotSource = features.lap ? "rank" : features.streak ? "streak" : features.tiers ? "tier" : "balance";
  const b3: SlotSource =
    features.tiers && top !== "tier" ? "tier" : features.streak && top !== "streak" ? "streak" : "none";
  return {
    top: { src: top },
    b1: { src: "customer" },
    b2: { src: features.lap ? "lap" : "reward" },
    b3: { src: b3 },
    b4: { src: top === "balance" ? "none" : "balance" },
    foot: { src: "sentence" },
  };
}

/* ------------------------------------------------------------------ */
/*  Lecture et nettoyage (tout ce qui vient du navigateur est vérifié) */
/* ------------------------------------------------------------------ */

const SOURCES = new Set<string>(SLOT_SOURCES.map((s) => s.src));
const FOOTS = new Set<string>(["sentence", "custom", "none"]);
const HEX = /^#[0-9a-f]{6}$/i;
const PATH_OK = /^[MLQCZ0-9 \-]*$/;
export const FONT_IDS = ["moderne", "impact", "elegant", "manuscrit"] as const;

/** Seules les images envoyées dans le stockage Walty (Supabase, dossier public « logos ») sont acceptées. */
const STORAGE_URL = /^https:\/\/([a-z0-9-]+\.supabase\.co)\/storage\/v1\/object\/public\/logos\/[\w.-]+(\/[\w.-]+)*$/i;
const OWN_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.toLowerCase() : null;
  } catch {
    return null;
  }
})();
export const isStorageUrl = (v: unknown): v is string => {
  if (typeof v !== "string" || v.length >= 400 || v.includes("..")) return false;
  const m = STORAGE_URL.exec(v);
  return !!m && (!OWN_HOST || OWN_HOST.endsWith(".supabase.co") === false || m[1].toLowerCase() === OWN_HOST);
};

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : "");
const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

function cleanPos(v: unknown): LayerPos | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const pos: LayerPos = { x: round(num(o.x, -0.2, 1.2, 0.5)), y: round(num(o.y, -0.2, 1.2, 0.5)) };
  if (o.size !== undefined) pos.size = round(num(o.size, 2, 100, 10), 2);
  return pos;
}

function cleanLayer(v: unknown, i: number, iconIds?: Set<string>): ArtLayer | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const kind: LayerKind | null = o.kind === "icon" || o.kind === "text" || o.kind === "logo" || o.kind === "mascot" ? o.kind : null;
  if (!kind) return null;
  const layer: ArtLayer = {
    id: str(o.id, 24).replace(/[^\w-]/g, "") || `l${i}`,
    kind,
    color: color(o.color, "#ffffff"),
    bg: o.bg === null || o.bg === undefined ? null : color(o.bg, "#000000"),
    size: round(num(o.size, 2, 100, 10), 2),
    rot: round(num(o.rot, -180, 180, 0), 1),
    x: round(num(o.x, -0.2, 1.2, 0.5)),
    y: round(num(o.y, -0.2, 1.2, 0.5)),
  };
  if (kind === "text") {
    const d = typeof o.d === "string" ? o.d : "";
    if (!d || d.length > 60000 || !PATH_OK.test(d)) return null;
    layer.text = str(o.text, 80);
    layer.font = FONT_IDS.includes(o.font as (typeof FONT_IDS)[number]) ? (o.font as string) : "moderne";
    layer.d = d;
    layer.w = round(num(o.w, 1, 200000, 1000), 1);
    layer.cy = round(num(o.cy, -200000, 200000, 350), 1);
    layer.cap = round(num(o.cap, 100, 2000, 700), 1);
    layer.hb = round(num(o.hb, 100, 400000, 1000), 1);
  } else if (kind === "icon") {
    const icon = str(o.icon, 24);
    if (!icon || (iconIds && !iconIds.has(icon))) return null;
    layer.icon = icon;
  } else if (kind === "mascot") {
    layer.pose = MASCOT_POSES.includes(o.pose as (typeof MASCOT_POSES)[number]) ? (o.pose as (typeof MASCOT_POSES)[number]) : "wave";
  }
  if (o.at && typeof o.at === "object") {
    const at = o.at as Record<string, unknown>;
    const apple = cleanPos(at.apple);
    const google = cleanPos(at.google);
    if (apple || google) layer.at = { ...(apple ? { apple } : {}), ...(google ? { google } : {}) };
  }
  return layer;
}

/** Lit une disposition (base de données ou formulaire) en ne gardant que des valeurs sûres. */
export function parseLayout(raw: unknown, iconIds?: Set<string>): CardLayout {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return { layers: [] };
    }
  }
  if (!v || typeof v !== "object") return { layers: [] };
  const o = v as Record<string, unknown>;
  const out: CardLayout = { layers: [] };

  if (o.slots && typeof o.slots === "object") {
    const s = o.slots as Record<string, unknown>;
    const slots: NonNullable<CardLayout["slots"]> = {};
    for (const key of FIELD_SLOTS) {
      const c = s[key] as Record<string, unknown> | undefined;
      if (!c || typeof c !== "object" || !SOURCES.has(String(c.src))) continue;
      const cfg: SlotConfig = { src: c.src as SlotSource };
      const label = str(c.label, 20).trim();
      const value = str(c.value, 40).trim();
      if (label) cfg.label = label;
      if (cfg.src === "custom" && value) cfg.value = value;
      slots[key] = cfg;
    }
    const f = s.foot as Record<string, unknown> | undefined;
    if (f && typeof f === "object" && FOOTS.has(String(f.src))) {
      const value = str(f.value, 90).trim();
      slots.foot = { src: f.src as FootSource, ...(f.src === "custom" && value ? { value } : {}) };
    }
    if (Object.keys(slots).length > 0) out.slots = slots;
  }

  if (Array.isArray(o.layers)) {
    out.layers = o.layers
      .slice(0, 16)
      .map((l, i) => cleanLayer(l, i, iconIds))
      .filter((l): l is ArtLayer => l !== null);
  }

  if (o.stamps && typeof o.stamps === "object") {
    const st = o.stamps as Record<string, unknown>;
    const stamps: CardLayout["stamps"] = {};
    for (const k of ["poster", "apple", "google"] as const) {
      if (st[k] !== undefined && st[k] !== null) stamps[k] = round(num(st[k], 0, 1, 0.5));
    }
    if (Object.keys(stamps).length > 0) out.stamps = stamps;
  }

  if (o.bg && typeof o.bg === "object") {
    const b = o.bg as Record<string, unknown>;
    const bg: CardLayout["bg"] = {};
    for (const k of ART_FORMATS) if (isStorageUrl(b[k])) bg[k] = b[k] as string;
    if (Object.keys(bg).length > 0) out.bg = bg;
  }

  if (o.crop && typeof o.crop === "object") {
    const c = o.crop as Record<string, unknown>;
    const crop: CardLayout["crop"] = {};
    for (const k of ART_FORMATS) {
      const v = c[k] as Record<string, unknown> | undefined;
      if (!v || typeof v !== "object") continue;
      crop[k] = { x: round(num(v.x, 0, 1, 0.5), 3), y: round(num(v.y, 0, 1, 0.5), 3), zoom: round(num(v.zoom, 1, 4, 1), 2) };
    }
    if (Object.keys(crop).length > 0) out.crop = crop;
  }

  if (STAMP_LOOKS.includes(o.look as StampLook)) out.look = o.look as StampLook;
  if (o.topLogo === false) out.topLogo = false;
  if (FILLS.includes(o.fill as Fill)) out.fill = o.fill as Fill;
  const trade = str(o.trade, 20).replace(/[^a-z]/g, "");
  if (trade) out.trade = trade;
  return out;
}

/** Position d'un calque pour un format donné. */
export function layerPos(layer: ArtLayer, format: ArtFormat | "googleLegacy"): { x: number; y: number; size: number } {
  // L'ancien bandeau Android (3:1) reprend les réglages faits pour Android
  const key = format === "googleLegacy" ? "google" : format;
  const alt = key === "poster" ? undefined : layer.at?.[key];
  return { x: alt?.x ?? layer.x, y: alt?.y ?? layer.y, size: alt?.size ?? layer.size };
}
