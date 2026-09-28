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

export const FORMATS = {
  apple: { w: 375, h: 144 },
  google: { w: 375, h: 122 },
  poster: { w: 358, h: 448 },
} as const;
export type BannerFormat = "apple" | "google";

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
  check: "Coche",
  gift: "Cadeau",
};

export type Focus = "top" | "center" | "bottom";
export type BannerStyle = "glass" | "minimal" | "none";

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
  const by = top ?? H - bandH - (H > 130 ? 12 : 9);
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
function minimalDots(o: BannerOptions, W: number, H: number): string {
  const total = Math.max(1, Math.min(30, o.total));
  const gap = Math.min(15, (W - 40) / total);
  const r = Math.min(4.2, gap * 0.3);
  const y = H - 16;
  return Array.from({ length: total }, (_, i) => {
    const x = 20 + i * gap + r;
    const isGift = o.rewardOnLast && i === total - 1;
    if (i < o.filled) return `<circle cx="${x}" cy="${y}" r="${r}" fill="${isGift ? o.accent : "#ffffff"}"/>`;
    return `<circle cx="${x}" cy="${y}" r="${r - 0.4}" fill="none" stroke="${isGift ? o.accent : "#ffffff"}" stroke-opacity=".8" stroke-width="1"/>`;
  }).join("");
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
  const progress = o.style === "glass" ? glassBand(o, W, H) : o.style === "minimal" ? minimalDots(o, W, H) : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width ?? W}" height="${height ?? H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${backdrop(o, W, H, "bg")}${scrim}${progress}</svg>`;
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
        : minimalDots(o as BannerOptions, W, 86)
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
    <rect y="${H * 0.46}" width="${W}" height="${H * 0.54}" fill="url(#bottom)"/>
    ${stamps}
  </svg>`;
  return prefixIds(svg, uid);
}
