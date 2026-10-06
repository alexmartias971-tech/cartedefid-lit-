/**
 * Moteur visuel « photo » des cartes (isomorphe : navigateur + serveur).
 * Le MÊME code dessine l'aperçu du tableau de bord et les images envoyées aux Wallet.
 *
 * Formats officiels (en points, @1x) :
 *  - Apple, carte de fidélité (storeCard) : bannière 375 × 144  → 1125 × 432 px en @3x
 *  - Google Wallet : image « héros » 1032 × 336 px (3:1)          → base 375 × 122
 *  - Apple iOS 27, carte « poster » (posterGeneric) : 358 × 448   → 1074 × 1344 px en @3x
 *
 * Icônes : Lucide (licence ISC, https://lucide.dev) — traits fins, style « app ».
 */

import { layerPos, type ArtFormat, type ArtLayer } from "@/lib/layout";

export const FORMATS = {
  apple: { w: 375, h: 144 },
  google: { w: 375, h: 122 },
  poster: { w: 358, h: 448 },
} as const;
export type BannerFormat = "apple" | "google";

const FLAME_ICON =
  '<path d="M12 3q1 4 4 6.5t3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 5 .5c0-2-1.5-3-1.5-5.5 0-1.5.5-3 2.5-4"/>';

/** Icônes au trait (viewBox 24 × 24). */
export const LINE_ICONS: Record<string, string> = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  coffee:
    '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  iced: '<path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8"/><path d="M5 8h14"/><path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0"/><path d="m12 8 1-6h2"/>',
  matcha:
    '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
  icecream: '<path d="m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11"/><path d="M17 7A5 5 0 0 0 7 7"/><path d="M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4"/>',
  glass: '<path d="M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z"/><path d="M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0"/>',
  coconut:
    '<path d="M21.66 17.67a1.08 1.08 0 0 1-.04 1.6A12 12 0 0 1 4.73 2.38a1.1 1.1 0 0 1 1.61-.04z"/><path d="M19.65 15.66A8 8 0 0 1 8.35 4.34"/><path d="m14 10-5.5 5.5"/><path d="M14 17.85V10H6.15"/>',
  palm: '<path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  shell:
    '<path d="M14 11a2 2 0 1 1-4 0 4 4 0 0 1 8 0 6 6 0 0 1-12 0 8 8 0 0 1 16 0 10 10 0 1 1-20 0 11.93 11.93 0 0 1 2.42-7.22 2 2 0 1 1 3.16 2.44"/>',
  hibiscus:
    '<path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1"/><circle cx="12" cy="8" r="2"/><path d="M12 10v12"/><path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"/><path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"/>',
  star: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  heart:
    '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
  croissant:
    '<path d="M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487"/><path d="M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132"/><path d="M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42"/><path d="M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14"/><path d="M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676"/>',
  cake: '<path d="M16 13H3"/><path d="M16 17H3"/><path d="m7.2 7.9-3.388 2.5A2 2 0 0 0 3 12.01V20a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8.654c0-2-2.44-6.026-6.44-8.026a1 1 0 0 0-1.082.057L10.4 5.6"/><circle cx="9" cy="7" r="2"/>',
  scissors:
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  waves: '<path d="M2 12q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 19q2.5 2 5 0t5 0 5 0 5 0"/><path d="M2 5q2.5 2 5 0t5 0 5 0 5 0"/>',
  flame: FLAME_ICON,
  gift: '<path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/>',
};

export const LINE_ICON_LABELS: Record<string, string> = {
  coffee: "Café",
  iced: "Boisson glacée",
  matcha: "Matcha / thé",
  icecream: "Glace",
  glass: "Verre",
  coconut: "Agrume",
  palm: "Palmier",
  sun: "Soleil",
  shell: "Coquillage",
  hibiscus: "Fleur",
  star: "Étoile",
  heart: "Cœur",
  croissant: "Viennoiserie",
  cake: "Gâteau",
  scissors: "Ciseaux",
  waves: "Vagues",
  flame: "Flamme",
  check: "Coche",
  gift: "Cadeau",
};

export type Focus = "top" | "center" | "bottom";
export type BannerStyle = "glass" | "minimal" | "track" | "none";

export type BannerOptions = {
  photo?: string | null; // URL ou data: (photo réelle du commerce)
  focus: Focus; // partie de la photo à garder
  brand: string; // couleur de la marque (fond, fondus)
  accent: string; // couleur du cadeau / détails
  darken: number; // 0-80 : assombrit la photo
  style: BannerStyle;
  total: number;
  filled: number;
  icons: string[]; // une icône, ou une collection qui se répète
  rewardOnLast: boolean;
  /** Série de semaines d'affilée (style « piste ») : flammes allumées / objectif. */
  streak?: { count: number; goal: number } | null;
  /** Textes et stickers posés sur la photo dans l'éditeur. */
  layers?: ArtLayer[];
  /** Hauteur de la bande de tampons (0 = en haut, 1 = en bas). null = place par défaut. */
  stampsY?: number | null;
};

function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

const ALIGN: Record<Focus, string> = { top: "xMidYMin slice", center: "xMidYMid slice", bottom: "xMidYMax slice" };

function mix(hex: string, other: string, t: number): string {
  const p = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    const n = m ? parseInt(m[1], 16) : 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = p(hex);
  const b = p(other);
  return `#${a.map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, "0")).join("")}`;
}

function icon(id: string, x: number, y: number, size: number, color: string, opacity = 1, weight = 1.75): string {
  const body = LINE_ICONS[id] ?? LINE_ICONS.check;
  return `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/** Photo (ou dégradé de marque si pas de photo), cadrée sur la zone choisie. */
function backdrop(o: Pick<BannerOptions, "photo" | "focus" | "brand" | "darken">, W: number, H: number, id: string, filter = "") {
  if (!o.photo) {
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(o.brand, "#ffffff", 0.14)}"/><stop offset="1" stop-color="${mix(o.brand, "#000000", 0.25)}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id})" ${filter}/>`;
  }
  return `<rect width="${W}" height="${H}" fill="${o.brand}"/><image href="${esc(o.photo)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="${ALIGN[o.focus]}" ${filter}/>${
    o.darken > 0 ? `<rect width="${W}" height="${H}" fill="#000" fill-opacity="${o.darken / 100}"/>` : ""
  }`;
}

/** Bandeau de tampons en « verre dépoli » posé sur la photo. */
function glassBand(o: BannerOptions, W: number, H: number, top?: number): string {
  const total = Math.max(1, Math.min(20, o.total));
  const rows = total > 12 ? 2 : 1;
  const perRow = Math.ceil(total / rows);
  const cell = Math.min(31, (W - 44) / perRow);
  const r = cell * 0.4;
  const bandW = perRow * cell + 18;
  const bandH = rows * cell + 12;
  const bx = (W - bandW) / 2;
  const by =
    o.stampsY != null
      ? Math.min(H - bandH - 2, Math.max(2, o.stampsY * H - bandH / 2))
      : (top ?? H - bandH - (H > 130 ? 12 : 9));
  const blur = `<clipPath id="band"><rect x="${bx}" y="${by}" width="${bandW}" height="${bandH}" rx="${Math.min(bandH / 2, 22)}"/></clipPath>
    <filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="7"/></filter>`;
  const glass = `<g clip-path="url(#band)">${backdrop(o, W, H, "bandbg", 'filter="url(#soft)"')}<rect width="${W}" height="${H}" fill="#ffffff" fill-opacity=".14"/><rect width="${W}" height="${H}" fill="${o.brand}" fill-opacity=".18"/></g>
    <rect x="${bx + 0.4}" y="${by + 0.4}" width="${bandW - 0.8}" height="${bandH - 0.8}" rx="${Math.min(bandH / 2, 22)}" fill="none" stroke="#ffffff" stroke-opacity=".42" stroke-width=".8"/>`;
  const ink = mix(o.brand, "#000000", 0.15);
  const cells = Array.from({ length: total }, (_, i) => {
    const row = Math.floor(i / perRow);
    const inRow = row === rows - 1 ? total - perRow * (rows - 1) : perRow;
    const col = i - row * perRow;
    const x0 = bx + 9 + ((perRow - inRow) * cell) / 2;
    const cx = x0 + col * cell + cell / 2;
    const cy = by + 6 + row * cell + cell / 2;
    const filled = i < o.filled;
    const isGift = o.rewardOnLast && i === total - 1;
    const id = isGift ? "gift" : o.icons.length > 0 ? o.icons[i % o.icons.length] : "check";
    const s = r * 1.12;
    if (filled) {
      const bg = isGift ? o.accent : "#ffffff";
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>${icon(id, cx, cy, s, isGift ? mix(o.accent, "#000000", 0.55) : ink, 1, 1.9)}`;
    }
    if (isGift) {
      return `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="${o.accent}" fill-opacity=".22" stroke="${o.accent}" stroke-width="1.3"/>${icon(id, cx, cy, s, o.accent, 1, 1.7)}`;
    }
    return `<circle cx="${cx}" cy="${cy}" r="${r - 0.5}" fill="#ffffff" fill-opacity=".06" stroke="#ffffff" stroke-opacity=".7" stroke-width="1"/>${icon(id, cx, cy, s, "#ffffff", 0.62, 1.5)}`;
  }).join("");
  return `<defs>${blur}</defs>${glass}${cells}`;
}

/** Style minimal : une rangée de points fins en bas à gauche. */
function minimalDots(o: BannerOptions, W: number, H: number, fullH = H): string {
  const total = Math.max(1, Math.min(30, o.total));
  const gap = Math.min(15, (W - 40) / total);
  const r = Math.min(4.2, gap * 0.3);
  const y = o.stampsY != null ? Math.min(fullH - 8, Math.max(8, o.stampsY * fullH)) : H - 16;
  return Array.from({ length: total }, (_, i) => {
    const x = 20 + i * gap + r;
    const isGift = o.rewardOnLast && i === total - 1;
    if (i < o.filled) return `<circle cx="${x}" cy="${y}" r="${r}" fill="${isGift ? o.accent : "#ffffff"}"/>`;
    return `<circle cx="${x}" cy="${y}" r="${r - 0.4}" fill="none" stroke="${isGift ? o.accent : "#ffffff"}" stroke-opacity=".8" stroke-width="1"/>`;
  }).join("");
}


/* ============================ STYLE « PISTE » (course) ============================ */

/**
 * Tracé réel de la Karuk'Arena (relevé sur le plan officiel du circuit, même orientation).
 * Boîte 100 × 88, le premier point est la ligne de départ / arrivée.
 */
const TRACK_POINTS: [number, number][] = [[51.8, 73.2], [49.2, 74.8], [47.7, 75.4], [45.9, 76.7], [44.4, 77.9], [42.0, 79.6], [39.2, 81.4], [37.8, 82.3], [36.1, 83.3], [33.7, 84.3], [30.4, 85.5], [27.3, 86.7], [25.8, 87.2], [23.6, 87.5], [20.7, 87.7], [17.0, 87.4], [14.7, 87.0], [12.7, 87.0], [9.8, 87.0], [7.1, 85.8], [5.0, 84.0], [3.5, 82.5], [2.6, 81.5], [0.9, 79.0], [0.0, 75.1], [0.6, 72.1], [0.8, 70.8], [1.3, 69.3], [3.0, 66.1], [4.8, 63.9], [7.4, 62.5], [10.1, 61.5], [12.6, 60.8], [15.2, 59.4], [16.7, 56.1], [16.2, 52.1], [15.6, 48.4], [15.2, 45.1], [14.7, 42.4], [14.6, 40.4], [14.7, 39.4], [15.2, 37.7], [16.3, 35.4], [17.9, 32.8], [19.7, 30.0], [21.5, 27.4], [22.9, 25.6], [24.8, 23.4], [27.3, 21.3], [29.5, 20.3], [31.0, 20.0], [32.3, 20.0], [34.5, 20.6], [37.4, 21.5], [40.6, 22.7], [42.9, 23.7], [45.7, 24.8], [47.5, 25.5], [49.0, 26.0], [52.3, 27.5], [55.9, 29.9], [57.7, 32.0], [58.4, 33.6], [58.3, 34.6], [57.0, 36.3], [55.1, 37.9], [53.8, 38.4], [52.4, 38.2], [50.1, 37.3], [47.9, 36.0], [45.8, 34.6], [43.4, 33.1], [39.8, 32.1], [35.5, 31.9], [33.0, 32.7], [31.4, 34.9], [30.5, 37.3], [30.5, 39.6], [31.2, 42.7], [32.1, 46.4], [32.6, 50.1], [32.7, 51.8], [32.3, 53.5], [31.5, 56.0], [30.5, 58.2], [29.0, 60.4], [27.2, 62.5], [25.4, 64.6], [23.4, 66.7], [21.4, 68.8], [19.3, 71.4], [17.5, 75.3], [17.3, 78.3], [18.7, 79.3], [20.7, 79.3], [23.2, 78.5], [26.4, 76.9], [28.7, 75.3], [30.6, 73.8], [32.6, 72.4], [34.7, 71.0], [36.8, 69.6], [39.1, 68.2], [41.3, 66.9], [43.6, 65.5], [45.9, 64.1], [48.3, 62.8], [51.2, 62.0], [54.4, 61.6], [56.9, 60.5], [59.2, 59.1], [61.5, 57.7], [63.7, 56.4], [66.0, 55.0], [68.1, 53.5], [70.2, 52.1], [72.3, 50.6], [74.4, 49.1], [76.3, 47.4], [77.5, 45.0], [78.0, 41.7], [78.5, 38.6], [79.1, 36.0], [79.4, 33.4], [79.5, 31.7], [79.3, 31.0], [78.7, 29.7], [76.8, 27.4], [74.1, 25.2], [71.1, 23.6], [67.8, 22.0], [64.9, 20.8], [62.5, 19.8], [60.6, 19.0], [58.5, 18.1], [56.0, 17.1], [54.5, 16.5], [53.0, 15.9], [50.0, 14.8], [46.6, 13.5], [43.8, 12.3], [41.3, 10.9], [39.4, 8.6], [38.6, 6.4], [38.9, 5.0], [40.1, 3.1], [42.5, 1.3], [45.3, 0.1], [47.9, 0.2], [51.3, 1.2], [54.4, 2.6], [56.8, 3.7], [58.8, 4.7], [60.6, 5.5], [63.1, 6.8], [65.9, 8.2], [69.7, 10.0], [72.9, 11.5], [74.9, 12.4], [75.9, 12.9], [77.9, 13.9], [80.4, 15.1], [82.1, 15.9], [84.8, 17.2], [87.0, 18.3], [89.2, 19.8], [91.3, 21.2], [93.4, 21.9], [96.6, 22.4], [99.2, 24.0], [99.6, 27.0], [99.4, 29.5], [99.7, 32.7], [100.0, 35.1], [99.6, 36.1], [98.2, 38.2], [95.8, 40.6], [92.5, 43.1], [90.0, 45.0], [88.6, 46.1], [87.3, 46.8], [84.9, 48.3], [81.3, 51.1], [78.5, 53.5], [77.0, 54.6], [75.5, 55.7], [73.5, 57.2], [71.8, 58.3], [70.2, 59.0], [67.8, 60.4], [65.0, 62.6], [62.8, 64.6], [60.7, 66.3], [58.5, 68.0], [56.3, 69.7], [53.4, 72.0]];
const TRACK_W = 100;
const TRACK_H = 88;

type Pt = [number, number];
let trackCache: { pts: Pt[]; len: number[]; total: number } | null = null;

/** Circuit lissé (Chaikin) + longueurs cumulées. */
function trackGeometry() {
  if (trackCache) return trackCache;
  let pts: Pt[] = TRACK_POINTS.map((p) => [p[0], p[1]] as Pt);
  for (let k = 0; k < 2; k++) {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = out;
  }
  pts.push(pts[0]);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  trackCache = { pts, len, total: len[len.length - 1] };
  return trackCache;
}

/** Point et direction à une fraction t (0-1) du tour. */
function trackAt(t: number): { p: Pt; a: number; i: number } {
  const g = trackGeometry();
  const d = Math.max(0, Math.min(1, t)) * g.total;
  let i = 1;
  while (i < g.len.length - 1 && g.len[i] < d) i++;
  const r = (d - g.len[i - 1]) / Math.max(1e-6, g.len[i] - g.len[i - 1]);
  const a = g.pts[i - 1], b = g.pts[i];
  return { p: [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r], a: Math.atan2(b[1] - a[1], b[0] - a[0]), i };
}

/** Morceau du circuit entre deux fractions du tour. */
function trackSlice(t0: number, t1: number): Pt[] {
  const g = trackGeometry();
  const a = trackAt(t0), b = trackAt(t1);
  const out: Pt[] = [a.p];
  for (let i = a.i; i < b.i; i++) out.push(g.pts[i]);
  out.push(b.p);
  return out;
}

/**
 * Le circuit en secteurs : un tampon = un secteur allumé en orange néon (comme le plan du circuit).
 * Les secteurs restants sont gris ; le kart est au bout de la partie allumée ;
 * la ligne d'arrivée en damier = le cadeau. Tient dans la boîte (x, y, w, h).
 */
function trackLayer(o: BannerOptions, box: { x: number; y: number; w: number; h: number }): string {
  const pad = 0.03;
  const scale = Math.min((box.w * (1 - pad * 2)) / TRACK_W, (box.h * (1 - pad * 2)) / TRACK_H);
  const ox = box.x + (box.w - TRACK_W * scale) / 2;
  const oy = box.y + (box.h - TRACK_H * scale) / 2;
  const P = (p: Pt) => [ox + p[0] * scale, oy + p[1] * scale] as Pt;
  const line = (pts: Pt[]) => pts.map((p) => P(p).map((v) => v.toFixed(2)).join(",")).join(" ");
  const u = scale;
  const total = Math.max(1, Math.min(30, o.total));
  const filled = Math.max(0, Math.min(total, o.filled));
  const accent = o.accent;
  const hot = "#FFB547";
  const g = trackGeometry();
  const all = line(g.pts);
  const W1 = 4.3 * u; // bord de piste
  const W2 = 3.1 * u; // asphalte

  // Secteurs allumés (orange néon) ; le secteur suivant est en pointillés
  const litSectors = Array.from({ length: filled }, (_, i) => line(trackSlice(i / total, (i + 1) / total)));
  const next = filled < total ? line(trackSlice(filled / total, (filled + 1) / total)) : "";

  // Traits de séparation des secteurs (perpendiculaires à la piste)
  const ticks = Array.from({ length: total - 1 }, (_, k) => {
    const { p, a } = trackAt((k + 1) / total);
    const [cx, cy] = P(p);
    const dx = Math.cos(a + Math.PI / 2) * W1 * 0.62, dy = Math.sin(a + Math.PI / 2) * W1 * 0.62;
    const done = k + 1 <= filled;
    return `<line x1="${cx - dx}" y1="${cy - dy}" x2="${cx + dx}" y2="${cy + dy}" stroke="${done ? "#fff" : "#ffffff"}" stroke-opacity="${done ? 0.95 : 0.4}" stroke-width="${0.9 * u}" stroke-linecap="round"/>`;
  }).join("");

  // Ligne d'arrivée en damier
  const start = trackAt(0);
  const [sx, sy] = P(start.p);
  const deg = (start.a * 180) / Math.PI + 90;
  const cell = W1 / 4;
  const checker = Array.from({ length: 8 }, (_, k) => {
    const col = k % 4, row = Math.floor(k / 4);
    return (col + row) % 2 === 0 ? `<rect x="${(col - 2) * cell}" y="${(row - 1) * cell}" width="${cell}" height="${cell}" fill="#fff"/>` : "";
  }).join("");
  const finish = `<g transform="translate(${sx} ${sy}) rotate(${deg})"><rect x="${-2 * cell}" y="${-cell}" width="${4 * cell}" height="${2 * cell}" fill="#111"/>${checker}</g>`;

  // Kart en tête
  const frac = filled / total;
  const head = trackAt(frac >= 1 ? 0.9999 : frac);
  const [hx, hy] = P(head.p);
  const kart =
    frac > 0 && frac < 1
      ? `<circle cx="${hx}" cy="${hy}" r="${4.4 * u}" fill="${hot}" opacity=".6" filter="url(#tglow)"/><circle cx="${hx}" cy="${hy}" r="${2.4 * u}" fill="#fff"/><circle cx="${hx}" cy="${hy}" r="${1.25 * u}" fill="${accent}"/>`
      : "";

  // Cadeau sous la ligne d'arrivée (s'allume quand le tour est bouclé)
  const done = frac >= 1;
  const gx = sx + Math.cos(start.a + Math.PI / 2) * 6.8 * u, gy = sy + Math.sin(start.a + Math.PI / 2) * 6.8 * u;
  const gift = o.rewardOnLast
    ? `<g transform="translate(${gx} ${gy})">${done ? `<circle r="${4.6 * u}" fill="${hot}" opacity=".6" filter="url(#tglow)"/>` : ""}<circle r="${3.3 * u}" fill="${done ? accent : "#111"}" stroke="${accent}" stroke-width="${0.45 * u}"/>${icon("gift", 0, 0, 3.8 * u, done ? "#111" : accent, 1, 2)}</g>`
    : "";

  return `<defs>
      <filter id="tglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${1.5 * u}"/></filter>
      <radialGradient id="tvig" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".88"/><stop offset=".62" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2}" rx="${TRACK_W * scale * 0.85}" ry="${TRACK_H * scale * 0.78}" fill="url(#tvig)"/>
    <polyline points="${all}" fill="none" stroke="#ffffff" stroke-opacity=".34" stroke-width="${W1}" stroke-linejoin="round"/>
    <polyline points="${all}" fill="none" stroke="#151515" stroke-width="${W2}" stroke-linejoin="round"/>
    ${litSectors.map((pts) => `<polyline points="${pts}" fill="none" stroke="${accent}" stroke-width="${W1 * 1.25}" stroke-linejoin="round" opacity=".55" filter="url(#tglow)"/>`).join("")}
    ${litSectors.map((pts) => `<polyline points="${pts}" fill="none" stroke="${accent}" stroke-width="${W1}" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="#1a1208" stroke-width="${W2}" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="${accent}" stroke-opacity=".28" stroke-width="${W2}" stroke-linejoin="round"/>`).join("")}
    ${next ? `<polyline points="${next}" fill="none" stroke="${accent}" stroke-opacity=".9" stroke-width="${0.7 * u}" stroke-dasharray="${1.4 * u} ${1.1 * u}" stroke-linejoin="round"/>` : ""}
    ${ticks}${finish}${gift}${kart}`;
}

/** Flammes de la série (semaines d'affilée) : goal flammes, count allumées. */
function streakPips(o: BannerOptions, cx: number, cy: number, size: number): string {
  if (!o.streak || o.streak.goal < 2) return "";
  const goal = Math.min(8, o.streak.goal);
  const lit = o.streak.count <= 0 ? 0 : o.streak.count % goal === 0 ? goal : o.streak.count % goal;
  const gap = size * 1.25;
  const x0 = cx - ((goal - 1) * gap) / 2;
  return Array.from({ length: goal }, (_, i) =>
    i < lit
      ? `<circle cx="${x0 + i * gap}" cy="${cy}" r="${size * 0.62}" fill="${o.accent}" opacity=".35" filter="url(#tglow)"/>${icon("flame", x0 + i * gap, cy, size, "#FFD34D", 1, 2.1)}`
      : icon("flame", x0 + i * gap, cy, size, "#ffffff", 0.35, 1.6),
  ).join("");
}

function prefixIds(svg: string, uid: string) {
  return svg.replace(/id="([\w-]+)"/g, `id="${uid}-$1"`).replace(/url\(#([\w-]+)\)/g, `url(#${uid}-$1)`);
}

/** Bannière (Apple strip 375×144 ou Google héros 375×122), agrandie à width × height. */
export function buildBannerSvg(o: BannerOptions, format: BannerFormat, width?: number, height?: number, uid = "b"): string {
  const { w: W, h: H } = FORMATS[format];
  const scrim =
    o.photo && o.style !== "none"
      ? `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#scrim)"/>`
      : "";
  const progress =
    o.style === "glass"
      ? glassBand(o, W, H)
      : o.style === "minimal"
        ? minimalDots(o, W, H)
        : o.style === "track"
          ? trackLayer(o, { x: W * 0.2, y: 3, w: W * 0.6, h: H - 6 }) + streakPips(o, W * 0.12, H - 14, 12)
          : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width ?? W}" height="${height ?? H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${backdrop(o, W, H, "bg")}${scrim}${progress}${layersSvg(o.layers, format, W, H)}</svg>`;
  return prefixIds(svg, uid);
}

/**
 * Visuel plein format de la carte « poster » (iOS 27) : la photo occupe toute la carte,
 * avec un léger voile en haut (logo) et un fondu vers la couleur de marque en bas
 * (là où l'iPhone affiche les champs et le QR code).
 */
export function buildPosterSvg(
  o: Pick<BannerOptions, "photo" | "focus" | "brand" | "darken"> & Partial<BannerOptions>,
  width?: number,
  height?: number,
  uid = "p",
): string {
  const { w: W, h: H } = FORMATS.poster;
  // Tampons sous la ligne du logo (zone laissée libre par l'iPhone)
  const stamps =
    o.style && o.style !== "none" && o.total
      ? o.style === "glass"
        ? glassBand(o as BannerOptions, W, H, 58)
        : o.style === "track"
          ? // Marges de sécurité : l'iPhone agrandit l'image et rogne un peu les côtés ; le QR code arrive vers y = 225.
            trackLayer(o as BannerOptions, { x: 24, y: 36, w: W - 48, h: 168 })
          : minimalDots(o as BannerOptions, W, 86, H)
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width ?? W}" height="${height ?? H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
    ${backdrop(o, W, H, "bg")}
    <defs>
      <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${o.brand}" stop-opacity="0"/>
        <stop offset=".45" stop-color="${o.brand}" stop-opacity=".72"/>
        <stop offset="1" stop-color="${mix(o.brand, "#000000", 0.2)}" stop-opacity=".97"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H * 0.26}" fill="url(#top)"/>
    <rect y="${H * 0.58}" width="${W}" height="${H * 0.42}" fill="url(#bottom)"/>
    ${stamps}
    ${layersSvg(o.layers, "poster", W, H)}
  </svg>`;
  return prefixIds(svg, uid);
}

/* ============================ CALQUES LIBRES (éditeur visuel) ============================ */

/** Un texte ou un sticker posé sur la photo, au format demandé. */
export function layerSvg(layer: ArtLayer, format: ArtFormat, W: number, H: number): string {
  const pos = layerPos(layer, format);
  const m = Math.min(W, H);
  const X = (pos.x * W).toFixed(2);
  const Y = (pos.y * H).toFixed(2);
  const rot = layer.rot || 0;
  if (layer.kind === "icon") {
    const D = (pos.size / 100) * m;
    const bg = layer.bg ? `<circle cx="${X}" cy="${Y}" r="${(D / 2).toFixed(2)}" fill="${layer.bg}"/>` : "";
    const size = layer.bg ? D * 0.58 : D;
    return `<g transform="rotate(${rot} ${X} ${Y})">${bg}${icon(layer.icon ?? "star", Number(X), Number(Y), size, layer.color, 1, layer.bg ? 2 : 1.8)}</g>`;
  }
  if (!layer.d) return "";
  const cap = layer.cap || 700;
  const k = ((pos.size / 100) * m) / cap;
  const w = layer.w || 1000;
  const cy = layer.cy ?? cap / 2;
  const hb = layer.hb || cap;
  const padX = cap * 0.6;
  const padY = cap * 0.5;
  const pill = layer.bg
    ? `<rect x="${-padX}" y="${cy - hb / 2 - padY}" width="${w + padX * 2}" height="${hb + padY * 2}" rx="${hb > cap * 1.2 ? cap * 0.45 : (hb + padY * 2) / 2}" fill="${layer.bg}"/>`
    : "";
  return `<g transform="translate(${X} ${Y}) rotate(${rot}) scale(${k.toFixed(5)} ${(-k).toFixed(5)}) translate(${(-w / 2).toFixed(1)} ${(-cy).toFixed(1)})">${pill}<path d="${layer.d}" fill="${layer.color}"/></g>`;
}

export function layersSvg(layers: ArtLayer[] | undefined, format: ArtFormat, W: number, H: number): string {
  if (!layers || layers.length === 0) return "";
  return layers.map((l) => layerSvg(l, format, W, H)).join("");
}

/** Cadre de la bande de tampons (pour la poignée de l'éditeur). null = pas de bande déplaçable. */
export function stampsBox(o: BannerOptions, format: ArtFormat): { x: number; y: number; w: number; h: number } | null {
  const { w: W, h: H } = FORMATS[format];
  if (!o.total || o.style === "none" || o.style === "track") return null;
  if (o.style === "minimal") {
    const total = Math.max(1, Math.min(30, o.total));
    const gap = Math.min(15, (W - 40) / total);
    const y = o.stampsY != null ? Math.min(H - 8, Math.max(8, o.stampsY * H)) : format === "poster" ? 70 : H - 16;
    return { x: 14, y: y - 9, w: total * gap + 12, h: 18 };
  }
  const total = Math.max(1, Math.min(20, o.total));
  const rows = total > 12 ? 2 : 1;
  const perRow = Math.ceil(total / rows);
  const cell = Math.min(31, (W - 44) / perRow);
  const bandW = perRow * cell + 18;
  const bandH = rows * cell + 12;
  const top = format === "poster" ? 58 : undefined;
  const by =
    o.stampsY != null
      ? Math.min(H - bandH - 2, Math.max(2, o.stampsY * H - bandH / 2))
      : (top ?? H - bandH - (H > 130 ? 12 : 9));
  return { x: (W - bandW) / 2, y: by, w: bandW, h: bandH };
}

/** Cadre d'un calque (centre, largeur, hauteur, rotation) dans le format demandé — pour la sélection dans l'éditeur. */
export function layerBox(layer: ArtLayer, format: ArtFormat, W: number, H: number): { cx: number; cy: number; w: number; h: number; rot: number } {
  const pos = layerPos(layer, format);
  const m = Math.min(W, H);
  if (layer.kind === "icon") {
    const D = (pos.size / 100) * m;
    return { cx: pos.x * W, cy: pos.y * H, w: D, h: D, rot: layer.rot || 0 };
  }
  const cap = layer.cap || 700;
  const k = ((pos.size / 100) * m) / cap;
  const padX = layer.bg ? cap * 0.6 : cap * 0.15;
  const padY = layer.bg ? cap * 0.5 : cap * 0.25;
  return { cx: pos.x * W, cy: pos.y * H, w: ((layer.w || 1000) + padX * 2) * k, h: ((layer.hb || cap) + padY * 2) * k, rot: layer.rot || 0 };
}
