/**
 * Les couleurs d'une page CLIENT aux couleurs du commerce (page d'inscription /c/[slug]).
 *
 * Tout part des 4 couleurs de la carte (fond, textes, libellés, tampons). Chaque couleur de texte est vérifiée
 * (contraste WCAG AA : 4,5:1 pour le texte, 3:1 pour les contours et l'anneau de focus). Si une couleur du
 * commerce ne passe pas, on la fonce ou on l'éclaircit juste ce qu'il faut : sa teinte est gardée.
 * Fonctionne pour n'importe quelle couleur (très claire, très foncée, saturée, ou absente / illisible).
 *
 * Fichier pur (aucun accès réseau) : utilisable côté serveur comme côté navigateur.
 */

export type RGB = readonly [number, number, number];

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
/** Presque noir, pour les textes sur fond clair (plus doux que le noir pur). */
const NIGHT: RGB = [20, 18, 22];
/** Fond de secours quand la carte n'a pas de couleur lisible : un graphite neutre (jamais le violet Walty). */
const GRAPHITE: RGB = [38, 38, 44];

// ---------------------------------------------------------------- outils couleur

/** Lit « #abc », « #aabbcc », « #aabbccdd » ou « rgb(r, g, b) ». Renvoie null si illisible. */
export function parseColor(input: unknown): RGB | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  let m = /^#?([0-9a-f]{3})$/i.exec(s);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as unknown as RGB;
  m = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as unknown as RGB;
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v))) as unknown as RGB;
  return null;
}

/** « #rrggbb » (toujours normalisé : sûr à écrire dans du CSS). */
export function toHex(c: RGB): string {
  return `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

function rgba(c: RGB, alpha: number): string {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`;
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative (WCAG). */
export function luminance(c: RGB): number {
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}

/** Rapport de contraste WCAG entre deux couleurs (1 à 21). */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mélange de a vers b (t = 0 → a, t = 1 → b), arrondi au pixel près. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as unknown as RGB;
}

function distance(a: RGB, b: RGB) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * La couleur c, foncée OU éclaircie le moins possible pour atteindre `ratio` sur le fond `on`.
 * Si c'est impossible (fond moyen + ratio élevé), le noir ou le blanc le plus lisible.
 */
export function readable(c: RGB, on: RGB, ratio: number): RGB {
  if (contrast(c, on) >= ratio) return c;
  let best: { m: RGB; t: number } | null = null;
  for (const target of [BLACK, WHITE]) {
    for (let i = 1; i <= 100; i++) {
      const m = mix(c, target, i / 100);
      if (contrast(m, on) >= ratio) {
        if (!best || i < best.t) best = { m, t: i };
        break;
      }
    }
  }
  if (best) return best.m;
  return contrast(BLACK, on) >= contrast(WHITE, on) ? BLACK : WHITE;
}

/** Atténue c vers `toward` au maximum (jusqu'à maxT) tant qu'il garde `ratio` sur le fond `on`. */
function soften(c: RGB, toward: RGB, on: RGB, ratio: number, maxT: number): RGB {
  let best = c;
  for (let i = 1; i <= 40; i++) {
    const m = mix(c, toward, (maxT * i) / 40);
    if (contrast(m, on) < ratio) break;
    best = m;
  }
  return best;
}

/** Blanc ou presque-noir : le plus lisible sur `bg`. */
function bestText(bg: RGB): RGB {
  return contrast(WHITE, bg) >= contrast(NIGHT, bg) ? WHITE : NIGHT;
}

// ---------------------------------------------------------------- thème de la page

export type ShopColors = {
  background_color?: string | null;
  foreground_color?: string | null;
  label_color?: string | null;
  stamp_color?: string | null;
};

export type ShopTheme = {
  /** Couleur de fond (pour la barre du navigateur et le fond de page). */
  bg: string;
  /** Variables CSS --ws-* à poser sur la page. */
  vars: Record<string, string>;
  /** Fond clair (textes foncés) ? */
  light: boolean;
};

/**
 * Le thème de la page : fond = couleur de la carte, textes lisibles dessus,
 * une feuille claire pour le formulaire, et une couleur d'action prise dans la carte.
 */
export function shopTheme(colors: ShopColors | null | undefined): ShopTheme {
  const bg = parseColor(colors?.background_color) ?? GRAPHITE;
  const fgRaw = parseColor(colors?.foreground_color);
  const labelRaw = parseColor(colors?.label_color);
  const stampRaw = parseColor(colors?.stamp_color);

  // Textes posés sur le fond de la page : la couleur des textes de la carte (à peine ajustée si besoin) ;
  // si elle ne se lit pas du tout, une autre couleur de la carte, sinon une teinte profonde du fond lui-même
  const ink =
    fgRaw && contrast(fgRaw, bg) >= 3
      ? readable(fgRaw, bg, 4.5)
      : ([labelRaw, stampRaw].find((c): c is RGB => !!c && contrast(c, bg) >= 4.5) ??
        (fgRaw ? readable(bg, bg, 9) : readable(bestText(bg), bg, 4.5)));
  const light = luminance(ink) < luminance(bg);
  // Texte secondaire : la couleur des libellés si elle est du même côté que le texte (plus claire, ou plus foncée,
  // que le fond, comme lui : le dégradé du fond ne peut alors qu'améliorer sa lecture), sinon le texte adouci
  const labelSide = labelRaw && luminance(labelRaw) < luminance(bg) === light;
  const inkSoft =
    labelRaw && labelSide && contrast(labelRaw, bg) >= 2.5 ? readable(labelRaw, bg, 4.5) : soften(ink, bg, bg, 4.5, 0.2);
  // Le dégradé du fond s'éloigne TOUJOURS des textes : le contraste ne peut que monter
  const away = light ? WHITE : BLACK;
  const bgDeep = mix(bg, away, light ? 0.45 : 0.2);
  const shadow = mix(bg, BLACK, light ? 0.55 : 0.72);

  // La feuille du formulaire : un blanc très légèrement teinté par la couleur du commerce
  const sheet = mix(WHITE, bg, 0.03);
  const sheetInk = readable(mix(NIGHT, bg, 0.14), sheet, 12);
  const field = mix(sheet, sheetInk, 0.028);
  // Contour des champs et des cases : 3:1 sur le fond du champ (WCAG 1.4.11)
  const line = soften(sheetInk, field, field, 3.1, 0.9);
  const hairline = mix(sheet, sheetInk, 0.11);
  const placeholder = soften(sheetInk, field, field, 4.6, 0.75);

  // Couleur d'action (bouton, case cochée) : la première couleur de la carte qui se voit sur la feuille
  // ET qui porte un texte lisible. Paires préférées : fond ↔ textes de la carte.
  const pairs: { c: RGB | null; texts: (RGB | null)[] }[] = [
    { c: bg, texts: [fgRaw, labelRaw] },
    { c: stampRaw, texts: [bg, fgRaw] },
    { c: fgRaw, texts: [bg, labelRaw] },
    { c: labelRaw, texts: [bg, fgRaw] },
  ];
  // 1er tour : texte de la carte ou blanc ; 2e tour seulement : texte presque noir sur la couleur
  let accent: RGB | null = null;
  let accentInk: RGB = WHITE;
  for (const extra of [[WHITE], [WHITE, NIGHT]]) {
    for (const { c, texts } of pairs) {
      if (accent || !c || contrast(c, sheet) < 3) continue;
      const text = [...texts, ...extra].find((t): t is RGB => !!t && contrast(t, c) >= 4.5);
      if (text) {
        accent = c;
        accentInk = text;
      }
    }
  }
  if (!accent) {
    // Aucune couleur de la carte ne se voit sur la feuille : le fond assombri (ou un presque-noir si le fond est gris/blanc)
    const neutral = Math.max(...bg) - Math.min(...bg) < 30;
    accent = neutral ? sheetInk : readable(bg, sheet, 4.5);
    accentInk = bestText(accent);
  }
  // Liens : sur la feuille, dans une case (fond du champ) ou dans une case cochée (léger voile de couleur)
  const wash = mix(sheet, accent, 0.06);
  const link = readable(readable(accent, wash, 4.5), field, 4.5);
  // Texte secondaire : sur la feuille ET dans les cases (cochées ou non) → vérifié sur le fond le plus proche de lui
  const darkest = luminance(wash) < luminance(field) ? wash : field;
  const sheetMuted = soften(sheetInk, sheet, darkest, 4.8, 0.6);
  const ring = readable(accent, sheet, 3);

  // Pastilles sur le fond : « forte » = couleurs inversées, « douce » = fond un peu plus loin des textes
  const chipSoft = mix(bg, away, 0.16);

  const vars: Record<string, string> = {
    "--ws-bg": toHex(bg),
    "--ws-bg-deep": toHex(bgDeep),
    "--ws-ink": toHex(ink),
    "--ws-ink-soft": toHex(inkSoft),
    "--ws-veil": rgba(ink, 0.18),
    "--ws-shadow": rgba(shadow, light ? 0.32 : 0.55),
    "--ws-shadow-strong": rgba(shadow, light ? 0.42 : 0.75),
    "--ws-chip-soft": toHex(chipSoft),
    "--ws-chip-soft-line": toHex(mix(chipSoft, ink, 0.22)),
    "--ws-sheet": toHex(sheet),
    "--ws-sheet-ink": toHex(sheetInk),
    "--ws-sheet-muted": toHex(sheetMuted),
    // Fin liseré autour de la feuille, utile seulement quand le fond de page est clair lui aussi
    "--ws-sheet-ring": light ? rgba(sheetInk, 0.09) : "transparent",
    "--ws-field": toHex(field),
    "--ws-line": toHex(line),
    "--ws-hairline": toHex(hairline),
    "--ws-placeholder": toHex(placeholder),
    "--ws-accent": toHex(accent),
    "--ws-accent-ink": toHex(accentInk),
    "--ws-accent-shadow": rgba(mix(accent, BLACK, 0.35), 0.55),
    "--ws-accent-wash": toHex(wash),
    "--ws-accent-line": toHex(mix(sheet, accent, 0.38)),
    "--ws-link": toHex(link),
    "--ws-ring": toHex(ring),
    "--ws-ring-soft": rgba(ring, 0.22),
  };
  return { bg: toHex(bg), vars, light };
}

/** Texte lisible (blanc ou presque noir) sur une couleur quelconque (ex. la pastille d'un niveau). */
export function inkOn(color: string | null | undefined): string {
  const c = parseColor(color);
  return toHex(c ? bestText(c) : NIGHT);
}

// ---------------------------------------------------------------- présentation du logo

/** Taille d'affichage d'un logo selon son format : jamais déformé, jamais plus grand que maxW × maxH. */
export function logoSize(ratio: number | null | undefined, maxW: number, maxH: number): { width: number; height: number } {
  const r = ratio && Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const h = Math.min(maxH, maxW / r);
  return { width: Math.round(h * r), height: Math.round(h) };
}

/** Ce que la page sait du logo (calculé côté serveur dans lib/logo.ts, à partir de l'image). */
export type LogoLook = {
  /** Largeur / hauteur (marges transparentes retirées). */
  ratio: number;
  /** Le logo a son propre fond (coins opaques). */
  opaque: boolean;
  /** Couleur des bords quand elle est unie (le fond du logo), sinon null. */
  edge: [number, number, number] | null;
  /** Part de l'image couverte par des pixels opaques (0 à 1). */
  coverage: number;
  /** Un échantillon des couleurs visibles du logo. */
  samples: [number, number, number][];
};

export type LogoPresentation =
  /** Fond du logo = fond de la page : posé tel quel, il se fond dans la page. */
  | { mode: "merge" }
  /** Logo avec son propre fond (autre couleur) : coins arrondis, ombre douce, pas de cadre. */
  | { mode: "badge" }
  /** Logo détouré, bien visible sur le fond : posé directement. */
  | { mode: "bare" }
  /** Forme pleine détourée (rond, écusson…) : posée directement, avec une ombre qui détache ses bords. */
  | { mode: "shape" }
  /** Logo détouré peu visible sur le fond : sur une pastille claire ou foncée (la plus lisible). */
  | { mode: "tile"; tile: string };

/** Choisit comment montrer le logo pour qu'il soit net et lisible, sans cadre blanc inutile. */
export function logoPresentation(look: LogoLook | null | undefined, colors: ShopColors | null | undefined): LogoPresentation {
  const bg = parseColor(colors?.background_color) ?? GRAPHITE;
  const lightTile = mix(WHITE, bg, 0.03);
  if (!look) return { mode: "tile", tile: toHex(lightTile) }; // inconnu : pastille claire, comme avant
  if (look.opaque) return look.edge && distance(look.edge, bg) < 22 ? { mode: "merge" } : { mode: "badge" };
  // Forme pleine (rond, écusson…) : elle porte son propre fond
  if (look.coverage >= 0.6) return { mode: "shape" };
  const share = (on: RGB, ratio: number) =>
    look.samples.length ? look.samples.filter((s) => contrast(s, on) >= ratio).length / look.samples.length : 0;
  if (share(bg, 2.2) >= 0.6) return { mode: "bare" };
  const darkTile = mix(NIGHT, bg, 0.18);
  return { mode: "tile", tile: toHex(share(lightTile, 3) >= share(darkTile, 3) ? lightTile : darkTile) };
}
