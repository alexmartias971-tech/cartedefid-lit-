/**
 * Moteur de visuel des cartes (bannière Apple "strip" / image Google "hero").
 * Tout est dessiné en SVG : le MÊME code sert à l'aperçu dans le tableau de bord
 * et à l'image envoyée dans le Wallet. Ce que tu vois = ce que le client reçoit.
 *
 * Coordonnées : la bannière fait 375 × 123 (format Apple @1x), agrandie ensuite.
 */

export const STRIP_W = 375;
export const STRIP_H = 123;

/* =========================== DÉCORS PRÊTS À L'EMPLOI =========================== */

export const DECOR_PRESETS = [
  { id: "none", label: "Couleur unie" },
  { id: "beach", label: "Plage turquoise (jour)" },
  { id: "sunset", label: "Coucher de soleil" },
  { id: "lagoon", label: "Vagues (couleurs de la marque)" },
  { id: "tropical", label: "Feuilles tropicales" },
  { id: "coffee", label: "Grains de café" },
  { id: "matcha", label: "Matcha" },
  { id: "terrazzo", label: "Confettis (couleurs de la marque)" },
  { id: "lines", label: "Lignes fines (minimal)" },
] as const;
export type DecorPreset = (typeof DECOR_PRESETS)[number]["id"];

/* ============================== ICÔNES DE TAMPON ============================== */

export const ICON_PRESETS = [
  { id: "check", label: "Coche" },
  { id: "coffee", label: "Café à emporter" },
  { id: "iced", label: "Thé glacé" },
  { id: "matcha", label: "Bol de matcha" },
  { id: "icecream", label: "Glace" },
  { id: "coconut", label: "Coco" },
  { id: "palm", label: "Palmier" },
  { id: "sun", label: "Soleil" },
  { id: "shell", label: "Coquillage" },
  { id: "hibiscus", label: "Hibiscus" },
  { id: "star", label: "Étoile" },
  { id: "heart", label: "Cœur" },
  { id: "croissant", label: "Croissant" },
  { id: "scissors", label: "Ciseaux" },
  { id: "gift", label: "Cadeau" },
] as const;
export type IconPreset = (typeof ICON_PRESETS)[number]["id"];

/**
 * Dessin d'une icône dans un carré 100 × 100.
 * fg = couleur du dessin ; cut = couleur des "découpes" (détails dans le dessin).
 */
export function iconSvg(id: string, fg: string, cut: string): string {
  switch (id) {
    case "coffee":
      return `<rect x="20" y="14" width="60" height="13" rx="6" fill="${fg}"/>
        <path d="M26 30 H74 L67 87 Q66 92 61 92 H39 Q34 92 33 87 Z" fill="${fg}"/>
        <path d="M30 49 H70 L68.4 64 H31.6 Z" fill="${cut}"/>
        <path d="M44 8 Q50 3 56 8" stroke="${fg}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case "iced":
      return `<path d="M26 26 H74 L67 90 Q66 95 61 95 H39 Q34 95 33 90 Z" fill="${fg}"/>
        <rect x="36" y="44" width="13" height="13" rx="2" transform="rotate(-12 42 50)" fill="${cut}" opacity=".8"/>
        <rect x="52" y="58" width="12" height="12" rx="2" transform="rotate(14 58 64)" fill="${cut}" opacity=".8"/>
        <path d="M58 30 L72 4" stroke="${fg}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="30" cy="27" r="11" fill="${fg}"/><circle cx="30" cy="27" r="6.5" fill="${cut}" opacity=".6"/>`;
    case "matcha":
      return `<path d="M12 50 H88 Q88 84 50 86 Q12 84 12 50 Z" fill="${fg}"/>
        <rect x="36" y="84" width="28" height="8" rx="3" fill="${fg}"/>
        <path d="M22 56 Q50 64 78 56" stroke="${cut}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
        <path d="M50 44 C28 40 30 14 60 8 C68 26 66 42 50 44 Z" fill="${fg}"/>
        <path d="M51 42 C52 30 55 20 59 12" stroke="${cut}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case "icecream":
      return `<path d="M33 50 H67 L50 95 Z" fill="${fg}"/>
        <path d="M38 58 L58 78 M62 58 L44 78 M36 52 L64 52" stroke="${cut}" stroke-width="3" opacity=".7"/>
        <path d="M28 48 A22 22 0 0 1 72 48 Q72 54 66 53 Q62 60 57 53 Q52 58 47 53 Q41 60 36 53 Q28 55 28 48 Z" fill="${fg}"/>
        <circle cx="60" cy="16" r="7" fill="${fg}"/>
        <path d="M60 10 Q62 3 68 2" stroke="${fg}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case "coconut":
      return `<circle cx="50" cy="58" r="34" fill="${fg}"/>
        <path d="M22 50 Q50 38 78 50 Q78 58 50 60 Q22 58 22 50 Z" fill="${cut}" opacity=".85"/>
        <path d="M58 48 L74 6" stroke="${fg}" stroke-width="5" stroke-linecap="round"/>
        <path d="M60 46 L80 30" stroke="${cut}" stroke-width="3" stroke-linecap="round" opacity=".7"/>
        <path d="M18 34 Q30 20 42 30 Q30 30 22 40 Z" fill="${fg}"/>`;
    case "palm":
      return `<path d="M47 95 Q42 68 51 40 L57 41 Q50 68 55 95 Z" fill="${fg}"/>
        <path d="M54 40 C40 24 22 24 8 36 C26 30 40 34 54 42 Z" fill="${fg}"/>
        <path d="M54 40 C66 22 84 22 94 34 C78 30 66 34 56 42 Z" fill="${fg}"/>
        <path d="M54 40 C46 20 50 8 62 2 C58 16 58 28 57 41 Z" fill="${fg}"/>
        <path d="M54 40 C36 38 22 50 18 66 C28 52 40 46 54 43 Z" fill="${fg}"/>
        <path d="M55 41 C70 40 82 50 86 64 C76 52 66 46 55 44 Z" fill="${fg}"/>
        <circle cx="50" cy="44" r="5" fill="${cut}" opacity=".6"/>`;
    case "sun":
      return `<circle cx="50" cy="50" r="21" fill="${fg}"/>
        ${Array.from({ length: 10 }, (_, i) => `<rect x="47" y="6" width="6" height="15" rx="3" fill="${fg}" transform="rotate(${i * 36} 50 50)"/>`).join("")}`;
    case "shell":
      return `<path d="M50 86 L16 44 Q50 2 84 44 Z" fill="${fg}"/>
        <path d="M50 84 L30 26 M50 84 L42 16 M50 84 L58 16 M50 84 L70 26 M50 84 L80 40 M50 84 L20 40" stroke="${cut}" stroke-width="3" opacity=".7"/>
        <rect x="40" y="82" width="20" height="10" rx="4" fill="${fg}"/>`;
    case "hibiscus":
      return `${Array.from({ length: 5 }, (_, i) => `<ellipse cx="50" cy="27" rx="17" ry="24" fill="${fg}" transform="rotate(${i * 72} 50 52)"/>`).join("")}
        <circle cx="50" cy="52" r="9" fill="${cut}" opacity=".85"/>
        <path d="M50 52 L66 30" stroke="${cut}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="67" cy="28" r="4" fill="${cut}"/>`;
    case "star":
      return `<path d="M50 6 L62 37 L95 38 L69 58 L78 91 L50 72 L22 91 L31 58 L5 38 L38 37 Z" fill="${fg}"/>`;
    case "heart":
      return `<path d="M50 88 C18 64 8 46 14 30 C20 14 42 12 50 30 C58 12 80 14 86 30 C92 46 82 64 50 88 Z" fill="${fg}"/>`;
    case "croissant":
      return `<path d="M8 64 Q14 30 50 26 Q86 30 92 64 Q84 54 74 56 Q66 40 50 40 Q34 40 26 56 Q16 54 8 64 Z" fill="${fg}"/>
        <path d="M38 42 L44 58 M50 40 L50 58 M62 42 L56 58" stroke="${cut}" stroke-width="3" opacity=".7"/>`;
    case "scissors":
      return `<circle cx="28" cy="74" r="13" fill="none" stroke="${fg}" stroke-width="7"/>
        <circle cx="72" cy="74" r="13" fill="none" stroke="${fg}" stroke-width="7"/>
        <path d="M36 64 L70 10 M64 64 L30 10" stroke="${fg}" stroke-width="7" stroke-linecap="round"/>`;
    case "gift":
      return `<rect x="14" y="40" width="72" height="18" rx="3" fill="${fg}"/>
        <rect x="20" y="58" width="60" height="34" rx="3" fill="${fg}"/>
        <rect x="45" y="40" width="10" height="52" fill="${cut}" opacity=".7"/>
        <path d="M50 40 C40 20 22 24 30 36 Z M50 40 C60 20 78 24 70 36 Z" fill="${fg}"/>`;
    case "check":
    default:
      return `<path d="M24 52 L42 70 L77 32" fill="none" stroke="${fg}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

/* ================================= DÉCORS ================================= */

function palmFrond(x: number, y: number, angle: number, len: number, color: string, opacity = 1): string {
  // Une palme : nervure centrale + folioles
  const leaflets = Array.from({ length: 9 }, (_, i) => {
    const t = (i + 1) / 10;
    const px = t * len;
    const w = Math.sin(t * Math.PI) * len * 0.34;
    return `<path d="M${px} 0 Q${px + len * 0.06} ${-w * 0.6} ${px + len * 0.14} ${-w}" stroke="${color}" stroke-width="${len * 0.035}" fill="none" stroke-linecap="round"/>
      <path d="M${px} 0 Q${px + len * 0.06} ${w * 0.6} ${px + len * 0.14} ${w}" stroke="${color}" stroke-width="${len * 0.035}" fill="none" stroke-linecap="round"/>`;
  }).join("");
  return `<g transform="translate(${x} ${y}) rotate(${angle})" opacity="${opacity}">
    <path d="M0 0 Q${len * 0.5} ${-len * 0.06} ${len} 0" stroke="${color}" stroke-width="${len * 0.03}" fill="none" stroke-linecap="round"/>
    ${leaflets}</g>`;
}

function monstera(x: number, y: number, size: number, angle: number, color: string, cut: string): string {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${size / 100})">
    <path d="M0 0 C-40 -10 -52 -60 -10 -92 C10 -100 44 -86 50 -52 C56 -18 30 8 0 0 Z" fill="${color}"/>
    <path d="M0 0 L2 -86" stroke="${cut}" stroke-width="3" opacity=".6"/>
    <path d="M-30 -40 L-12 -44 M-36 -64 L-14 -60 M34 -40 L14 -46 M36 -66 L16 -62" stroke="${cut}" stroke-width="7" stroke-linecap="round"/>
  </g>`;
}

export function decorSvg(preset: string, bg: string, accent: string, fg: string): string {
  const W = STRIP_W;
  const H = STRIP_H;
  switch (preset) {
    case "beach":
      return `<defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd3ea"/><stop offset="1" stop-color="#d9f4f4"/></linearGradient>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1bb6c8"/><stop offset="1" stop-color="#0a8aa0"/></linearGradient>
          <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e2bc"/><stop offset="1" stop-color="#ecc994"/></linearGradient>
          <radialGradient id="glow"><stop offset="0" stop-color="#fff6c8" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#sky)"/>
        <circle cx="318" cy="24" r="34" fill="url(#glow)"/>
        <circle cx="318" cy="24" r="13" fill="#ffe28a"/>
        <path d="M0 44 H${W} V${H} H0 Z" fill="url(#sea)"/>
        <path d="M0 52 Q30 49 60 52 T120 52 T180 52 T240 52 T300 52 T375 52" stroke="#ffffff" stroke-opacity=".35" stroke-width="1.2" fill="none"/>
        <path d="M0 62 Q40 58 80 62 T160 62 T240 62 T320 62 T400 62" stroke="#ffffff" stroke-opacity=".25" stroke-width="1" fill="none"/>
        <path d="M0 84 Q70 70 150 78 Q240 88 375 72 V${H} H0 Z" fill="url(#sand)"/>
        <path d="M0 84 Q70 70 150 78 Q240 88 375 72" stroke="#ffffff" stroke-opacity=".8" stroke-width="2.2" fill="none"/>
        <ellipse cx="300" cy="104" rx="46" ry="6" fill="#b98b52" opacity=".25"/>
        ${palmFrond(-6, -8, 38, 92, "#15613f", 0.95)}
        ${palmFrond(-10, 6, 12, 80, "#1d7a4f", 0.9)}
        ${palmFrond(4, -14, 62, 70, "#0f5234", 0.9)}
        ${palmFrond(W + 8, -10, 150, 78, "#15613f", 0.85)}`;
    case "sunset":
      return `<defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b3b8f"/><stop offset=".45" stop-color="#e8637a"/><stop offset="1" stop-color="#ffb36b"/></linearGradient>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b3f86"/><stop offset="1" stop-color="#2c2461"/></linearGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#sky)"/>
        <circle cx="250" cy="76" r="24" fill="#ffd27a"/>
        <rect x="0" y="76" width="${W}" height="${H - 76}" fill="url(#sea)"/>
        ${[80, 86, 93, 101, 110].map((y, i) => `<rect x="${250 - 30 + i * 4}" y="${y}" width="${60 - i * 8}" height="2" rx="1" fill="#ffd27a" opacity="${0.8 - i * 0.12}"/>`).join("")}
        <path d="M24 123 Q20 92 34 60 L38 61 Q27 92 32 123 Z" fill="#1a1433"/>
        ${palmFrond(36, 60, -160, 46, "#1a1433")}${palmFrond(36, 60, -20, 50, "#1a1433")}${palmFrond(36, 60, -95, 40, "#1a1433")}
        ${palmFrond(36, 60, 160, 40, "#1a1433")}${palmFrond(36, 60, 25, 42, "#1a1433")}`;
    case "lagoon":
      return `<rect width="${W}" height="${H}" fill="${bg}"/>
        <path d="M0 70 Q60 50 130 66 T260 60 T375 52 V123 H0 Z" fill="${accent}" opacity=".18"/>
        <path d="M0 86 Q80 66 160 84 T320 76 T375 72 V123 H0 Z" fill="${accent}" opacity=".28"/>
        <path d="M0 102 Q90 84 190 100 T375 94 V123 H0 Z" fill="${accent}" opacity=".4"/>
        <path d="M0 40 Q70 26 150 38 T300 32 T375 30" stroke="${fg}" stroke-opacity=".15" stroke-width="1.5" fill="none"/>
        <circle cx="330" cy="28" r="40" fill="${accent}" opacity=".12"/>`;
    case "tropical":
      return `<rect width="${W}" height="${H}" fill="#0e3b2e"/>
        ${monstera(40, 150, 120, -20, "#1d6b4e", "#0e3b2e")}
        ${monstera(330, 140, 110, 25, "#246f50", "#0e3b2e")}
        ${palmFrond(160, -20, 70, 90, "#2f8a60", 0.8)}
        ${palmFrond(250, 140, -70, 80, "#1a5a42", 0.9)}
        ${monstera(200, 150, 70, 5, "#2f8a60", "#0e3b2e")}
        <circle cx="300" cy="20" r="6" fill="${accent}" opacity=".9"/>
        <circle cx="90" cy="24" r="4" fill="${accent}" opacity=".8"/>`;
    case "coffee": {
      const beans = [
        [20, 18, 30], [70, 96, -20], [120, 30, 60], [180, 104, 10], [230, 20, -40], [290, 90, 70],
        [345, 28, 15], [40, 70, -60], [150, 70, 35], [260, 58, -10], [330, 108, 45], [95, 50, 5],
      ];
      return `<defs><linearGradient id="lat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9b48c"/><stop offset="1" stop-color="#9b6a45"/></linearGradient></defs>
        <rect width="${W}" height="${H}" fill="url(#lat)"/>
        ${beans.map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})"><ellipse rx="11" ry="7.5" fill="#4a2c1a" opacity=".55"/><path d="M-9 0 Q0 -3 9 0" stroke="#d9b48c" stroke-width="1.6" fill="none" opacity=".7"/></g>`).join("")}`;
    }
    case "matcha":
      return `<defs><linearGradient id="mt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3efcf"/><stop offset="1" stop-color="#a9cc86"/></linearGradient></defs>
        <rect width="${W}" height="${H}" fill="url(#mt)"/>
        <circle cx="300" cy="60" r="46" fill="none" stroke="#5f8f3e" stroke-width="10" stroke-dasharray="230 60" opacity=".35" stroke-linecap="round"/>
        <circle cx="70" cy="90" r="30" fill="none" stroke="#5f8f3e" stroke-width="6" stroke-dasharray="140 50" opacity=".25" stroke-linecap="round"/>
        <g transform="translate(150 20) rotate(20)" opacity=".35"><path d="M0 0 C-20 -4 -18 -30 10 -36 C18 -18 16 -2 0 0 Z" fill="#4f7d31"/></g>
        <g transform="translate(210 110) rotate(-30)" opacity=".3"><path d="M0 0 C-20 -4 -18 -30 10 -36 C18 -18 16 -2 0 0 Z" fill="#4f7d31"/></g>`;
    case "terrazzo": {
      const dots = Array.from({ length: 46 }, (_, i) => {
        const x = (i * 83) % W;
        const y = (i * 47 + (i % 3) * 13) % H;
        const r = 2 + ((i * 7) % 5);
        const c = i % 3 === 0 ? accent : i % 3 === 1 ? fg : "#ffffff";
        return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.7}" transform="rotate(${(i * 37) % 180} ${x} ${y})" fill="${c}" opacity="${0.25 + (i % 4) * 0.1}"/>`;
      }).join("");
      return `<rect width="${W}" height="${H}" fill="${bg}"/>${dots}`;
    }
    case "lines":
      return `<rect width="${W}" height="${H}" fill="${bg}"/>
        ${Array.from({ length: 30 }, (_, i) => `<path d="M${i * 16 - 60} ${H} L${i * 16 + 40} 0" stroke="${fg}" stroke-opacity=".07" stroke-width="1"/>`).join("")}`;
    case "none":
    default:
      return `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  }
}

/* ============================ ASSEMBLAGE DE LA BANNIÈRE ============================ */

export type ProgressStyle = "grid" | "collection" | "fill" | "none";
export type StampsPosition = "center" | "right" | "bottom";
export type Vessel = "glass" | "cup";

export type StripOptions = {
  background: string; // couleur de fond de la carte
  accent: string; // couleur des tampons
  foreground: string; // couleur des textes
  decorPreset: string; // décor prêt à l'emploi (si pas d'image)
  decorHref?: string | null; // image de décor envoyée (URL ou data:)
  overlay: number; // voile sombre 0-80 %
  style: ProgressStyle;
  position: StampsPosition;
  total: number;
  filled: number; // pour "fill" en mode points : progression déjà calculée en cases
  iconPreset: string;
  iconHref?: string | null;
  iconEmptyHref?: string | null;
  collection: string[]; // icônes successives pour le style "collection"
  vessel: Vessel;
  fillColor: string;
  rewardOnLast: boolean; // la dernière case montre un cadeau
};

function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Couleur lisible posée sur "on" : la couleur préférée si le contraste suffit, sinon noir ou blanc. */
export function readableOn(on: string, preferred: string): string {
  const a = luminance(on);
  const b = luminance(preferred);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (ratio >= 2.6) return preferred;
  return a > 0.4 ? "#1a1a1a" : "#ffffff";
}

function stampCell(o: StripOptions, i: number, cx: number, cy: number, s: number): string {
  const filled = i < o.filled;
  const isLast = i === o.total - 1;
  const iconId = o.style === "collection" && o.collection.length > 0 ? o.collection[i % o.collection.length] : o.iconPreset;
  const r = s / 2;
  const x = cx - r;
  const y = cy - r;

  // Icône envoyée (image)
  if (o.iconHref && o.style !== "collection") {
    const href = filled ? o.iconHref : (o.iconEmptyHref ?? o.iconHref);
    const op = filled || o.iconEmptyHref ? 1 : 0.32;
    return `<image href="${esc(href)}" x="${x}" y="${y}" width="${s}" height="${s}" opacity="${op}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const inner = s * 0.62;
  const ix = cx - inner / 2;
  const iy = cy - inner / 2;
  if (filled) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.accent}"/>
      <circle cx="${cx}" cy="${cy}" r="${r - s * 0.07}" fill="none" stroke="${o.background}" stroke-opacity=".25" stroke-width="${s * 0.03}"/>
      <svg x="${ix}" y="${iy}" width="${inner}" height="${inner}" viewBox="0 0 100 100">${iconSvg(iconId, readableOn(o.accent, o.background), o.accent)}</svg>`;
  }
  const showGift = o.rewardOnLast && isLast;
  const ghostId = showGift ? "gift" : iconId === "check" ? null : iconId;
  return `<circle cx="${cx}" cy="${cy}" r="${r - s * 0.04}" fill="#ffffff" fill-opacity=".14" stroke="${o.accent}" stroke-opacity="${showGift ? 0.95 : 0.7}" stroke-width="${s * 0.05}" ${showGift ? "" : `stroke-dasharray="${s * 0.1} ${s * 0.07}"`}/>
    ${ghostId ? `<svg x="${ix}" y="${iy}" width="${inner}" height="${inner}" viewBox="0 0 100 100" opacity="${showGift ? 0.9 : 0.35}">${iconSvg(ghostId, o.accent, o.background)}</svg>` : ""}`;
}

function gridLayer(o: StripOptions): string {
  const total = Math.max(1, Math.min(50, o.total));
  let area = { x: 14, y: 8, w: STRIP_W - 28, h: STRIP_H - 16 };
  let panel = "";
  let rows = total <= 6 ? 1 : total <= 14 ? 2 : 3;
  if (o.position === "right") {
    area = { x: 168, y: 10, w: 196, h: STRIP_H - 20 };
    rows = total <= 4 ? 1 : total <= 10 ? 2 : 3;
    panel = `<rect x="158" y="4" width="213" height="${STRIP_H - 8}" rx="14" fill="${o.background}" fill-opacity=".62"/>`;
  } else if (o.position === "bottom") {
    rows = total <= 12 ? 1 : 2;
    const bandH = rows === 1 ? 40 : 58;
    area = { x: 10, y: STRIP_H - bandH + 4, w: STRIP_W - 20, h: bandH - 8 };
    panel = `<rect x="0" y="${STRIP_H - bandH}" width="${STRIP_W}" height="${bandH}" fill="${o.background}" fill-opacity=".62"/>`;
  }
  const cols = Math.ceil(total / rows);
  const cell = Math.min(area.w / cols, area.h / rows);
  const s = cell * 0.84;
  const gridW = cols * cell;
  const gridH = rows * cell;
  const x0 = area.x + (area.w - gridW) / 2;
  const y0 = area.y + (area.h - gridH) / 2;
  const cells = Array.from({ length: total }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = row === rows - 1 ? total - cols * (rows - 1) : cols;
    const off = ((cols - inRow) * cell) / 2;
    return stampCell(o, i, x0 + off + col * cell + cell / 2, y0 + row * cell + cell / 2, s);
  }).join("");
  return panel + cells;
}

function fillLayer(o: StripOptions): string {
  const total = Math.max(1, o.total);
  const ratio = Math.max(0, Math.min(1, o.filled / total));
  // Récipient à droite ; le texte du Wallet s'affiche à gauche
  const cx = 318;
  const top = 12;
  const bottom = 116;
  const h = bottom - top;
  const wTop = o.vessel === "cup" ? 62 : 58;
  const wBot = o.vessel === "cup" ? 44 : 42;
  const left = (y: number) => cx - (wTop / 2 - ((wTop - wBot) / 2) * ((y - top) / h));
  const right = (y: number) => cx + (wTop / 2 - ((wTop - wBot) / 2) * ((y - top) / h));
  const level = bottom - h * ratio;
  const shape = `M${left(top)} ${top} L${right(top)} ${top} L${right(bottom)} ${bottom} L${left(bottom)} ${bottom} Z`;
  const ticks = Array.from({ length: total - 1 }, (_, i) => {
    const y = bottom - (h * (i + 1)) / total;
    return `<line x1="${right(y) - 7}" y1="${y}" x2="${right(y) - 1}" y2="${y}" stroke="${o.foreground}" stroke-opacity=".6" stroke-width="1"/>`;
  }).join("");
  const liquid =
    ratio > 0
      ? `<path d="M${left(level)} ${level} Q${cx - 10} ${level - 4} ${cx} ${level} T${right(level)} ${level} L${right(bottom)} ${bottom} L${left(bottom)} ${bottom} Z" fill="${o.fillColor}"/>
        ${o.vessel === "glass" && ratio > 0.2 ? `<rect x="${cx - 14}" y="${Math.max(level + 6, bottom - 40)}" width="11" height="11" rx="2" fill="#ffffff" opacity=".55" transform="rotate(-12 ${cx - 9} ${bottom - 30})"/><rect x="${cx + 2}" y="${Math.max(level + 14, bottom - 26)}" width="10" height="10" rx="2" fill="#ffffff" opacity=".5" transform="rotate(10 ${cx + 7} ${bottom - 20})"/>` : ""}
        <circle cx="${cx + 8}" cy="${bottom - 10}" r="2" fill="#ffffff" opacity=".6"/><circle cx="${cx - 6}" cy="${bottom - 18}" r="1.5" fill="#ffffff" opacity=".6"/>`
      : "";
  const deco =
    o.vessel === "glass"
      ? `<path d="M${cx + 8} ${top + 6} L${cx + 26} ${top - 20}" stroke="${o.accent}" stroke-width="5" stroke-linecap="round"/>`
      : `<rect x="${left(top) - 4}" y="${top - 9}" width="${wTop + 8}" height="10" rx="4" fill="${o.accent}"/>
         <path d="M${left(top + 38)} ${top + 38} L${right(top + 38)} ${top + 38} L${right(top + 58)} ${top + 58} L${left(top + 58)} ${top + 58} Z" fill="${o.accent}" opacity=".85"/>`;
  return `<defs><clipPath id="vessel"><path d="${shape}"/></clipPath></defs>
    <path d="${shape}" fill="#ffffff" fill-opacity=".22"/>
    <g clip-path="url(#vessel)">${liquid}</g>
    <path d="${shape}" fill="none" stroke="${o.foreground}" stroke-opacity=".85" stroke-width="2.2" stroke-linejoin="round"/>
    ${ticks}${deco}`;
}

/**
 * Bannière complète en SVG (375 × 123, agrandie via width/height).
 * uid : préfixe des identifiants internes, pour afficher plusieurs bannières sur une même page.
 */
export function buildStripSvg(o: StripOptions, width = STRIP_W, height = STRIP_H, uid = "s"): string {
  const decor = o.decorHref
    ? `<rect width="${STRIP_W}" height="${STRIP_H}" fill="${o.background}"/><image href="${esc(o.decorHref)}" x="0" y="0" width="${STRIP_W}" height="${STRIP_H}" preserveAspectRatio="xMidYMid slice"/>`
    : decorSvg(o.decorPreset, o.background, o.accent, o.foreground);
  const overlay = o.overlay > 0 ? `<rect width="${STRIP_W}" height="${STRIP_H}" fill="#000000" fill-opacity="${o.overlay / 100}"/>` : "";
  let progress = "";
  if (o.style === "grid" || o.style === "collection") progress = gridLayer(o);
  else if (o.style === "fill") progress = fillLayer(o);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${STRIP_W} ${STRIP_H}" preserveAspectRatio="xMidYMid slice">${decor}${overlay}${progress}</svg>`;
  return svg.replace(/id="([\w-]+)"/g, `id="${uid}-$1"`).replace(/url\(#([\w-]+)\)/g, `url(#${uid}-$1)`);
}
