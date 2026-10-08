/**
 * Ce que la carte doit afficher, selon le mode de récompense.
 * Utilisé partout (carte Apple, carte Google, carte web, aperçu, scanner) pour que
 * toutes les versions de la carte disent exactement la même chose.
 */
import { buildStripSvg, STRIP_H, STRIP_W, type StripOptions } from "@/lib/art";
import { buildBannerSvg, buildPosterSvg, FORMATS, LINE_ICONS, layersSvg, type BannerFormat, type BannerOptions, type BannerStyle, type LogoArt } from "@/lib/visual";
import { parseLayout, type ArtFormat, type CardLayout, type FieldSlot, type SlotConfig } from "@/lib/layout";
import type { CatalogReward, Coupon, Program, RewardMode, Tier } from "@/lib/types";

export const MODE_LABELS: Record<RewardMode, string> = {
  stamps: "Tampons",
  points: "Points",
  cashback: "Cashback",
};

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

type ProgramLike = Pick<
  Program,
  "mode" | "reward_threshold" | "reward_description" | "points_per_euro" | "cashback_percent" | "tiers_enabled" | "tier_basis"
> &
  Partial<Pick<Program, "streak_enabled" | "streak_goal" | "lap_times_enabled" | "progress_style">>;

type CardLike = {
  stamps_count: number;
  points_balance: number;
  cashback_balance: number;
  lifetime_visits: number;
  lifetime_spent: number;
  tier_id: string | null;
  streak_count?: number;
  streak_best?: number;
  streak_week?: string | null;
  best_lap_ms?: number | null;
  lap_rank?: number | null;
  lap_rank_total?: number;
};

/** Lundi (AAAA-MM-JJ) de la semaine en cours, heure de Guadeloupe (UTC-4). */
export function currentWeekStart(now = new Date()): string {
  const local = new Date(now.getTime() - 4 * 3600 * 1000);
  const dow = (local.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
}

/** Série encore vivante ? (venu cette semaine ou la semaine dernière) */
export function liveStreak(card: CardLike, now = new Date()): { count: number; thisWeek: boolean } {
  if (!card.streak_week || !card.streak_count) return { count: 0, thisWeek: false };
  const week = currentWeekStart(now);
  const last = new Date(`${week}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - 7);
  if (card.streak_week === week) return { count: card.streak_count, thisWeek: true };
  if (card.streak_week === last.toISOString().slice(0, 10)) return { count: card.streak_count, thisWeek: false };
  return { count: 0, thisWeek: false };
}

/** 38412 ms → "38.412" ; 62345 → "1:02.345" */
export function formatLap(ms: number | null | undefined): string | null {
  if (!ms) return null;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : String(Number(s).toFixed(3));
}

export type CardState = {
  /** Petit titre en haut à droite (ex : "TAMPONS"). */
  balanceLabel: string;
  /** Valeur en haut à droite (ex : "3/10", "120", "4,50 €"). */
  balanceValue: string;
  /** Pour les tampons : combien de cases remplies / au total. */
  stamps: { filled: number; total: number } | null;
  /** Ce qu'il reste avant le prochain cadeau (« ENCORE 7 passages »), ou le cadeau prêt. null = sans objet (cagnotte). */
  remaining: { label: string; value: string } | null;
  /** Phrase d'avancement affichée sur la carte. */
  sentence: string;
  /** Règle du programme en une phrase. */
  rule: string;
  /** Niveau actuel et suivant (si les niveaux sont activés). */
  tier: Tier | null;
  nextTier: { tier: Tier; remaining: string } | null;
  /** Cadeau ou récompense débloquée à valider en caisse (mode tampons). */
  rewardReady: boolean;
  /** Cadeaux du catalogue que le client peut déjà prendre (mode points). */
  affordable: CatalogReward[];
  /** Série de semaines d'affilée (si activée). */
  streak: { count: number; goal: number; thisWeek: boolean; best: number } | null;
  /** Meilleur tour, déjà mis en forme (si activé). */
  lap: string | null;
  /** Position au classement des meilleurs tours (si activé et si le client a un temps). */
  rank: { pos: number; total: number } | null;
};

export function computeCardState(
  program: ProgramLike,
  card: CardLike,
  tiers: Tier[] = [],
  catalog: CatalogReward[] = [],
): CardState {
  const base = computeBaseState(program, card, tiers, catalog);
  const live = liveStreak(card);
  const streak = program.streak_enabled
    ? { count: live.count, goal: program.streak_goal ?? 4, thisWeek: live.thisWeek, best: card.streak_best ?? 0 }
    : null;
  const rank =
    program.lap_times_enabled && card.lap_rank
      ? { pos: card.lap_rank, total: Math.max(card.lap_rank_total ?? card.lap_rank, card.lap_rank) }
      : null;
  return { ...base, streak, lap: program.lap_times_enabled ? formatLap(card.best_lap_ms) : null, rank };
}

function computeBaseState(
  program: ProgramLike,
  card: CardLike,
  tiers: Tier[] = [],
  catalog: CatalogReward[] = [],
): Omit<CardState, "streak" | "lap" | "rank"> {
  const threshold = program.reward_threshold;
  const sortedTiers = [...tiers].sort((a, b) => Number(a.min_value) - Number(b.min_value));
  const tier = program.tiers_enabled ? (sortedTiers.find((t) => t.id === card.tier_id) ?? null) : null;
  const metric = program.tier_basis === "spend" ? Number(card.lifetime_spent) : card.lifetime_visits;
  const next = program.tiers_enabled ? sortedTiers.find((t) => Number(t.min_value) > metric) : undefined;
  const nextTier = next
    ? {
        tier: next,
        remaining:
          program.tier_basis === "spend"
            ? `${formatEuro(Number(next.min_value) - metric)} d'achats`
            : `${Number(next.min_value) - metric} passage${Number(next.min_value) - metric > 1 ? "s" : ""}`,
      }
    : null;

  if (program.mode === "points") {
    const points = card.points_balance;
    const activeCatalog = catalog.filter((r) => r.is_active).sort((a, b) => a.cost - b.cost);
    const affordable = activeCatalog.filter((r) => r.cost <= points);
    const nextReward = activeCatalog.find((r) => r.cost > points);
    let sentence = `${points} point${points > 1 ? "s" : ""}.`;
    if (affordable.length > 0) sentence = `🎁 Tu peux obtenir : ${affordable[affordable.length - 1].name} ! Demande en caisse.`;
    else if (nextReward) {
      const euros = Math.ceil((nextReward.cost - points) / Math.max(0.01, Number(program.points_per_euro) || 1));
      sentence = `Plus que ${nextReward.cost - points} points (environ ${euros} € d'achats) avant ton cadeau : ${nextReward.name}.`;
    }
    return {
      balanceLabel: "POINTS",
      balanceValue: String(points),
      stamps: null,
      remaining:
        affordable.length > 0
          ? { label: "CADEAU", value: "Prêt 🎁" }
          : nextReward
            ? { label: "ENCORE", value: `${nextReward.cost - points} pts` }
            : null,
      sentence,
      rule: `${Number(program.points_per_euro)} point${Number(program.points_per_euro) > 1 ? "s" : ""} par euro dépensé.`,
      tier,
      nextTier,
      rewardReady: affordable.length > 0,
      affordable,
    };
  }

  if (program.mode === "cashback") {
    const balance = Number(card.cashback_balance);
    return {
      balanceLabel: "CAGNOTTE",
      balanceValue: formatEuro(balance),
      stamps: null,
      remaining: null,
      sentence:
        balance > 0
          ? `Tu as ${formatEuro(balance)} à dépenser en caisse.`
          : `${Number(program.cashback_percent)} % de chaque achat reviennent sur ta cagnotte.`,
      rule: `${Number(program.cashback_percent)} % de chaque achat crédités sur ta cagnotte, à utiliser quand tu veux.`,
      tier,
      nextTier,
      rewardReady: false,
      affordable: [],
    };
  }

  // Tampons : la phrase change selon l'avancement (on valorise ce qui est déjà fait, puis on crée l'envie près du but)
  const filled = Math.min(card.stamps_count, threshold);
  const left = threshold - card.stamps_count;
  const reward = program.reward_description;
  const track = program.progress_style === "track";
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
  let sentence: string;
  if (card.stamps_count >= threshold)
    sentence = track
      ? `🏆 Tour bouclé ! ${reward} : montre ta carte en caisse.`
      : `🎁 Ton cadeau t'attend : ${reward} ! Montre ta carte en caisse.`;
  else if (card.stamps_count === 0)
    sentence = track
      ? `🏁 1 session = 1 secteur. Les ${threshold} secteurs = 1 tour = ${reward}.`
      : card.lifetime_visits > 0
        ? `Régale-toi ! Une nouvelle carte commence : ${threshold} tampons = ${reward}.`
        : `${threshold} tampons = ${reward}. C'est parti !`;
  else if (track)
    sentence =
      left === 1
        ? `🏁 Dernier secteur ! Ta prochaine session boucle le tour = ${reward}.`
        : `🏁 1 session = 1 secteur · encore ${left} pour boucler le tour = ${reward}.`;
  // Avant la moitié, on montre ce qui est acquis ; après, ce qui reste (c'est ce qui motive le plus, Koo & Fishbach 2012)
  else if (left === 1) sentence = `Plus qu'un tampon avant ton cadeau : ${reward} !`;
  else if (left <= threshold / 2) sentence = `Plus que ${left} tampons avant ton cadeau : ${reward}.`;
  else if (!card.lifetime_visits) sentence = `Bienvenue ! ${plural(filled, "tampon")} offert${filled > 1 ? "s" : ""} pour bien démarrer. Ton cadeau au ${threshold}e tampon : ${reward}.`;
  else sentence = `Déjà ${plural(filled, "tampon")} ! Ton cadeau au ${threshold}e tampon : ${reward}.`;
  const firstHalf = card.stamps_count < threshold && left > threshold / 2;
  return {
    balanceLabel: track ? "SECTEURS" : "TAMPONS",
    balanceValue: `${filled}/${threshold}`,
    stamps: { filled, total: threshold },
    remaining:
      card.stamps_count >= threshold
        ? { label: "CADEAU", value: "Prêt 🎁" }
        : firstHalf
          ? { label: track ? "SECTEURS" : "TAMPONS", value: `${filled}/${threshold}` }
          : { label: "ENCORE", value: plural(left, track ? "secteur" : "tampon") },
    sentence,
    rule: `${threshold} tampons = ${reward}.`,
    tier,
    nextTier,
    rewardReady: card.stamps_count >= threshold,
    affordable: [],
  };
}

/**
 * Les 2 compteurs du recto Android, courts : Google conseille 9 caractères pour le titre et 7 pour la valeur.
 * Le cadeau est déjà écrit dans le titre de la carte (« 10 passages = 1 café offert »).
 */
export function googleFields(
  state: CardState,
  mode: RewardMode,
  balanceLabel: string,
  coupons: number,
): { left: { label: string; value: string }; right: { label: string; value: string } | null } {
  // Tampons : quand la carte est pleine, le cadeau prend la place du compteur. Points : le solde reste toujours visible.
  const left = state.rewardReady && mode === "stamps" ? { label: "CADEAU", value: "Prêt 🎁" } : { label: balanceLabel.slice(0, 9), value: state.balanceValue };
  let right: { label: string; value: string } | null = null;
  if (state.rewardReady && mode === "points") right = { label: "CADEAU", value: "Prêt 🎁" };
  else if (coupons > 0) right = { label: "OFFRES", value: String(coupons) };
  else if (state.rank) right = { label: "RANG", value: `P${state.rank.pos}` };
  else if (state.lap) right = { label: "RECORD", value: state.lap };
  else if (state.streak && state.streak.count > 0) right = { label: "SÉRIE", value: `${state.streak.count} sem.` };
  else if (state.tier) right = { label: "NIVEAU", value: state.tier.name };
  else if (!state.rewardReady && state.remaining?.label === "ENCORE") right = { label: "ENCORE", value: state.remaining.value.replace(/ (tampons?|secteurs?)$/, "") };
  return { left, right };
}

/** Phrase de la série (à afficher sous la carte ou en notification). */
export function streakSentence(state: CardState, bonus: number, unit: string): string | null {
  const st = state.streak;
  if (!st) return null;
  const toGoal = st.goal - (st.count % st.goal);
  const units = unit === "€" || bonus > 1 ? unit : unit.replace(/s$/, "");
  if (st.count === 0) return `🔥 Viens chaque semaine : ${st.goal} semaines d'affilée = ${bonus} ${units} en bonus.`;
  if (st.thisWeek) return `🔥 Série de ${st.count} semaine${st.count > 1 ? "s" : ""} ! Encore ${toGoal} pour ton bonus. À la semaine prochaine !`;
  return `🔥 Ta série de ${st.count} semaine${st.count > 1 ? "s" : ""} continue si tu viens avant dimanche soir !`;
}

/** Offres encore valables (non utilisées, non expirées). */
export function activeCoupons(coupons: Coupon[]): Coupon[] {
  const now = Date.now();
  return coupons.filter((c) => c.status === "active" && (!c.expires_at || new Date(c.expires_at).getTime() > now));
}

/** Champ affiché à côté du prénom sous la bannière. */
export function secondaryField(
  program: Pick<Program, "mode" | "reward_description" | "cashback_percent">,
  card: { points_balance: number },
  catalog: CatalogReward[],
): { label: string; value: string } | null {
  if (program.mode === "stamps") return { label: "CADEAU", value: program.reward_description };
  if (program.mode === "cashback") return { label: "CHAQUE ACHAT", value: `${Number(program.cashback_percent)} % en cagnotte` };
  const next = [...catalog].filter((r) => r.is_active).sort((a, b) => a.cost - b.cost).find((r) => r.cost > card.points_balance);
  return next ? { label: `À ${next.cost} PTS`, value: next.name } : null;
}

/** Tout ce qui décide de l'apparence d'une carte (identique pour l'aperçu et le Wallet). */
export type CardDesign = {
  mode: RewardMode;
  programName: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor: string;
  stampColor: string;
  stripOverlay: number;
  stripImageUrl: string | null;
  stampIconUrl: string | null;
  stampEmptyIconUrl: string | null;
  decorPreset: string;
  photoFocus: Program["photo_focus"];
  progressStyle: Program["progress_style"];
  stampsPosition: Program["stamps_position"];
  iconPreset: string;
  collectionIcons: string[];
  vessel: Program["vessel"];
  fillColor: string;
  rewardOnLast: boolean;
  showLogoText: boolean;
  labelBalance: string | null;
  labelCustomer: string | null;
  labelReward: string | null;
  /** Disposition choisie dans l'éditeur visuel (zones, textes et stickers sur la photo). */
  layout: CardLayout;
};

const ICON_IDS = new Set(Object.keys(LINE_ICONS));

/** Lit la disposition enregistrée d'un programme (vide si la colonne n'existe pas encore). */
export function layoutOf(program: Pick<Program, "card_layout">): CardLayout {
  return parseLayout(program.card_layout ?? null, ICON_IDS);
}

export function designFromProgram(program: Program): CardDesign {
  return {
    mode: program.mode,
    programName: program.name,
    backgroundColor: program.background_color,
    foregroundColor: program.foreground_color,
    labelColor: program.label_color,
    stampColor: program.stamp_color,
    stripOverlay: program.strip_overlay,
    stripImageUrl: program.strip_image_url,
    stampIconUrl: program.stamp_icon_url,
    stampEmptyIconUrl: program.stamp_empty_icon_url,
    decorPreset: program.decor_preset ?? "none",
    photoFocus: program.photo_focus ?? "center",
    progressStyle: program.progress_style ?? "glass",
    stampsPosition: program.stamps_position ?? "center",
    iconPreset: program.icon_preset ?? "check",
    collectionIcons: program.collection_icons ?? [],
    vessel: program.vessel ?? "glass",
    fillColor: program.fill_color ?? "#8FD16A",
    rewardOnLast: program.reward_on_last ?? true,
    showLogoText: program.show_logo_text ?? true,
    labelBalance: program.label_balance,
    labelCustomer: program.label_customer,
    labelReward: program.label_reward,
    layout: layoutOf(program),
  };
}

/** Titres des champs (personnalisables : "CAFÉS" au lieu de "TAMPONS", "MEMBRE"…). */
export function fieldLabels(design: Pick<CardDesign, "labelBalance" | "labelCustomer" | "labelReward">, state: CardState) {
  return {
    balance: (design.labelBalance || state.balanceLabel).toUpperCase(),
    customer: (design.labelCustomer || "CLIENT").toUpperCase(),
    reward: design.labelReward ? design.labelReward.toUpperCase() : null,
  };
}

/** Progression à dessiner sur la bannière (en cases). */
export function stripProgress(
  mode: RewardMode,
  state: CardState,
  card: { points_balance: number },
  catalog: CatalogReward[],
): Progress {
  const streak = state.streak ? { count: state.streak.count, goal: state.streak.goal } : null;
  return { ...baseProgress(mode, state, card, catalog), streak };
}

function baseProgress(
  mode: RewardMode,
  state: CardState,
  card: { points_balance: number },
  catalog: CatalogReward[],
): { total: number; filled: number } {
  if (mode === "stamps" && state.stamps) return state.stamps;
  if (mode === "points") {
    const next = [...catalog].filter((r) => r.is_active).sort((a, b) => a.cost - b.cost).find((r) => r.cost > card.points_balance);
    if (!next) return { total: 10, filled: catalog.length > 0 ? 10 : 0 };
    return { total: 10, filled: Math.floor((10 * card.points_balance) / next.cost) };
  }
  return { total: 10, filled: 0 };
}

/** Options de la bannière pour le moteur de dessin. */
export function stripOptions(
  design: CardDesign,
  progress: { total: number; filled: number },
  hrefs?: { decor?: string | null; icon?: string | null; iconEmpty?: string | null },
): StripOptions {
  // En mode cashback, pas de cases : la bannière reste décorative (sauf jauge)
  const raw = ["glass", "minimal", "track"].includes(design.progressStyle) ? "collection" : (design.progressStyle as Exclude<CardDesign["progressStyle"], "glass" | "minimal" | "track">);
  const style = design.mode === "cashback" && raw !== "none" ? "none" : raw;
  const pointsGrid = design.mode === "points" && (style === "grid" || style === "collection");
  return {
    background: design.backgroundColor,
    accent: design.stampColor,
    foreground: design.foregroundColor,
    decorPreset: design.decorPreset,
    decorHref: hrefs?.decor !== undefined ? hrefs.decor : design.stripImageUrl,
    overlay: design.stripOverlay,
    style: pointsGrid ? "fill" : style,
    position: design.stampsPosition,
    total: progress.total,
    filled: progress.filled,
    iconPreset: design.iconPreset,
    iconHref: hrefs?.icon !== undefined ? hrefs.icon : design.stampIconUrl,
    iconEmptyHref: hrefs?.iconEmpty !== undefined ? hrefs.iconEmpty : design.stampEmptyIconUrl,
    collection: design.collectionIcons.length > 0 ? design.collectionIcons : [design.iconPreset],
    vessel: design.vessel,
    fillColor: design.fillColor,
    rewardOnLast: design.rewardOnLast,
  };
}

/** Styles « photo » (nouveau moteur) : bandeau en verre dépoli ou points fins. */
export function isPhotoStyle(style: CardDesign["progressStyle"]) {
  return style === "glass" || style === "minimal" || style === "track";
}

type Progress = { total: number; filled: number; streak?: { count: number; goal: number } | null };

/** Images déjà prêtes pour le dessin : le logo (avec son format) et le format de la photo de fond. */
export type ArtAssets = { logo?: LogoArt | null; photoRatio?: number | null };

/** Options du moteur photo à partir du design (et d'une photo déjà convertie côté serveur). */
/** Carte pas encore enregistrée avec l'éditeur v2 (le bandeau Google garde alors l'ancien format 3:1). */
export function isLegacyLayout(layout: CardLayout | undefined): boolean {
  return !layout?.look;
}

/**
 * Format de l'image Android : l'ancien bandeau 3:1 tant que la carte n'est pas passée par l'éditeur v2,
 * et toujours pour les anciens styles dessinés (grille, collection, remplissage), qui ne rempliraient pas l'image presque carrée.
 */
export function googleBannerFormat(design: Pick<CardDesign, "layout" | "progressStyle" | "mode">): "google" | "googleLegacy" {
  const drawn = !(isPhotoStyle(design.progressStyle) || design.mode === "cashback" || design.progressStyle === "none");
  return isLegacyLayout(design.layout) || drawn ? "googleLegacy" : "google";
}

export function bannerOptions(
  design: CardDesign,
  progress: Progress,
  photo?: string | null,
  fmt: ArtFormat | BannerFormat = "apple",
  assets: ArtAssets = {},
): BannerOptions {
  // L'ancien bandeau Android (3:1) reprend les réglages faits pour Android (position des tampons, cadrage)
  const format = (fmt === "googleLegacy" ? "google" : fmt) as ArtFormat;
  const style: BannerStyle =
    design.mode === "cashback"
      ? "none"
      : design.progressStyle === "minimal" || design.progressStyle === "track" || design.progressStyle === "none"
        ? design.progressStyle
        : "glass";
  return {
    photo: photo !== undefined ? photo : design.stripImageUrl,
    focus: design.photoFocus,
    brand: design.backgroundColor,
    accent: design.stampColor,
    darken: design.stripOverlay,
    style,
    total: progress.total,
    filled: progress.filled,
    icons: design.progressStyle === "glass" || design.progressStyle === "minimal"
      ? design.collectionIcons.length > 0
        ? design.collectionIcons
        : [design.iconPreset]
      : [design.iconPreset],
    rewardOnLast: design.rewardOnLast,
    streak: progress.streak ?? null,
    layers: design.layout?.layers ?? [],
    stampsY: design.layout?.stamps?.[format] ?? null,
    look: design.layout?.look,
    fill: design.layout?.fill,
    gauge: design.mode === "points",
    logo: assets.logo ?? null,
    crop: design.layout?.crop?.[format] ?? null,
    photoRatio: assets.photoRatio ?? null,
  };
}

/**
 * Bannière finale en SVG, au bon format (Apple 375×144 ou Google 375×122).
 * Les anciens styles (dessins) restent possibles : ils sont centrés dans le bon format.
 */
export function cardBannerSvg(
  design: CardDesign,
  progress: Progress,
  format: BannerFormat,
  width: number,
  height: number,
  uid: string,
  hrefs?: { decor?: string | null; icon?: string | null; iconEmpty?: string | null } & ArtAssets,
): string {
  const assets: ArtAssets = { logo: hrefs?.logo, photoRatio: hrefs?.photoRatio };
  if (isPhotoStyle(design.progressStyle) || design.mode === "cashback" || design.progressStyle === "none") {
    return buildBannerSvg(bannerOptions(design, progress, hrefs?.decor, format, assets), format, width, height, uid);
  }
  const { w, h } = FORMATS[format];
  const legacy = buildStripSvg(stripOptions(design, progress, hrefs), STRIP_W, STRIP_H, uid);
  const inner = legacy.replace(/^<svg /, `<svg x="0" y="${(h - (w * STRIP_H) / STRIP_W) / 2}" `).replace(/width="\d+" height="\d+"/, `width="${w}" height="${(w * STRIP_H) / STRIP_W}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${design.backgroundColor}"/>${inner}${layersSvg(design.layout?.layers, format as ArtFormat, w, h, { logo: assets.logo, uid })}</svg>`;
}

/** Visuel plein format de la carte poster iOS 27 (photo du niveau si elle existe). */
export function cardPosterSvg(
  design: CardDesign,
  width: number,
  height: number,
  uid: string,
  photo?: string | null,
  progress?: Progress,
  assets: ArtAssets = {},
): string {
  const base = bannerOptions(design, progress ?? { total: 0, filled: 0 }, photo !== undefined ? photo : design.stripImageUrl, "poster", assets);
  return buildPosterSvg(progress ? base : { ...base, style: "none" }, width, height, uid);
}

/**
 * Photo à utiliser : celle du niveau du client, sinon le visuel propre à ce téléphone (s'il y en a un),
 * sinon la photo principale (recadrée automatiquement).
 */
export function photoFor(
  program: Pick<Program, "strip_image_url"> & Partial<Pick<Program, "card_layout">>,
  tier: Tier | null,
  format?: ArtFormat,
): string | null {
  if (tier?.image_url) return tier.image_url;
  const own = format ? layoutOf({ card_layout: program.card_layout }).bg?.[format] : undefined;
  return own || program.strip_image_url;
}

/** Points de progression en texte (affichés sur la carte poster iOS 27). */
export function progressDots(progress: { total: number; filled: number }): string {
  const total = Math.min(20, Math.max(1, progress.total));
  return Array.from({ length: total }, (_, i) => (i < progress.filled ? "●" : "○")).join(" ");
}

/** Phrase d'accroche pour l'affiche et la page d'inscription. */
export function programPitch(
  program: Pick<Program, "mode" | "reward_threshold" | "reward_description" | "points_per_euro" | "cashback_percent" | "welcome_offer">,
): string {
  const base =
    program.mode === "points"
      ? `${Number(program.points_per_euro)} point${Number(program.points_per_euro) > 1 ? "s" : ""} par euro, échangeables contre des cadeaux`
      : program.mode === "cashback"
        ? `${Number(program.cashback_percent)} % de tes achats reversés sur ta cagnotte`
        : `${program.reward_threshold} tampons = ${program.reward_description}`;
  return program.welcome_offer ? `${base} · Bienvenue : ${program.welcome_offer}` : base;
}

export type Field = { key: string; label: string; value: string; changeMessage?: string };

/**
 * Champs de la carte « poster » (iPhone iOS 27) — utilisés par la vraie carte ET par l'aperçu.
 * En-tête (1), champs du bas (4 max, le solde toujours à droite), pied (1 ligne).
 */
export function posterFields(
  state: CardState,
  labels: { balance: string; customer: string },
  customerName: string,
): { header: Field; primary: Field[]; footer: string } {
  const streakVal = state.streak ? `🔥 ${state.streak.count} SEM.` : "";
  const header: Field = state.rank
    ? { key: "prank", label: "CLASSEMENT", value: `P${state.rank.pos} / ${state.rank.total}`, changeMessage: "Classement : %@" }
    : state.streak
      ? { key: "pstreak", label: "SÉRIE", value: streakVal }
      : state.tier
        ? { key: "ptier", label: "NIVEAU", value: state.tier.name, changeMessage: "Nouveau niveau : %@ !" }
        : { key: "pbalance-h", label: labels.balance, value: state.balanceValue };
  const extra: Field[] = [];
  if (state.lap) extra.push({ key: "plap", label: "RECORD", value: state.lap, changeMessage: "⏱️ Nouveau record : %@ !" });
  if (state.streak && header.key !== "pstreak") extra.push({ key: "pstreak2", label: "SÉRIE", value: streakVal });
  if (state.tier && header.key !== "ptier") extra.push({ key: "ptier2", label: "NIVEAU", value: state.tier.name, changeMessage: "Nouveau niveau : %@ !" });
  const shown = extra.slice(0, 2);
  const primary: Field[] = [
    { key: "pcustomer", label: labels.customer, value: customerName },
    ...shown,
    { key: "pbalance", label: labels.balance, value: state.balanceValue },
  ];
  const tierHidden = state.tier && header.key !== "ptier" && !shown.some((f) => f.key === "ptier2");
  const footer = tierHidden ? `${state.tier!.name} · ${state.sentence}` : state.sentence;
  return { header, primary, footer };
}

/** Ce qu'il faut pour remplir les zones choisies dans l'éditeur. */
export type SlotContext = {
  customerName: string;
  mode: RewardMode;
  rewardDescription: string;
  cashbackPercent: number;
  /** Prochain cadeau du catalogue (mode points). */
  nextReward: { cost: number; name: string } | null;
  coupons: number;
  /** L'alerte « classement » seulement pour les clients qui acceptent les messages. */
  rankAlerts?: boolean;
};

export type ResolvedSlots = {
  top: Field | null;
  /** Les 4 champs du bas, dans l'ordre (null = zone vide ou information indisponible). */
  bottom: (Field | null)[];
  footer: string | null;
};

/** Valeur d'une zone (null si l'information n'existe pas pour ce client, ex : pas de niveau). */
export function slotField(
  key: string,
  cfg: SlotConfig | undefined,
  state: CardState,
  labels: { balance: string; customer: string; reward: string | null },
  ctx: SlotContext,
): Field | null {
  if (!cfg) return null;
  const title = (fallback: string) => (cfg.label ? cfg.label.toUpperCase() : fallback);
  // La source fait partie de la clé : changer l'information d'une zone crée un nouveau champ (aucune notification aux clients)
  const k = `z${key}-${cfg.src}`;
  switch (cfg.src) {
    case "balance":
      return { key: k, label: title(labels.balance), value: state.balanceValue };
    case "remaining":
      if (ctx.mode === "points" && !state.rewardReady) return { key: k, label: title(labels.balance), value: state.balanceValue };
      if (state.remaining) return { key: k, label: title(state.remaining.label), value: state.remaining.value };
      return { key: k, label: title(labels.balance), value: state.balanceValue };
    case "customer":
      return { key: k, label: title(labels.customer), value: ctx.customerName };
    case "reward":
      if (ctx.mode === "stamps") return { key: k, label: title(labels.reward ?? "CADEAU"), value: ctx.rewardDescription };
      if (ctx.mode === "cashback") return { key: k, label: title("CHAQUE ACHAT"), value: `${Number(ctx.cashbackPercent)} % en cagnotte` };
      return ctx.nextReward ? { key: k, label: title(`À ${ctx.nextReward.cost} PTS`), value: ctx.nextReward.name } : null;
    case "tier":
      return state.tier ? { key: k, label: title("NIVEAU"), value: state.tier.name, changeMessage: "Nouveau niveau : %@ !" } : null;
    case "streak":
      return state.streak ? { key: k, label: title("SÉRIE"), value: `🔥 ${state.streak.count} sem.` } : null;
    case "lap":
      return state.lap ? { key: k, label: title("RECORD"), value: state.lap, changeMessage: "⏱️ Nouveau record : %@ !" } : null;
    case "rank":
      return state.rank
        ? {
            key: k,
            label: title("CLASSEMENT"),
            value: `P${state.rank.pos} / ${state.rank.total}`,
            ...(ctx.rankAlerts !== false ? { changeMessage: "Classement : %@" } : {}),
          }
        : null;
    case "offers":
      return ctx.coupons > 0 ? { key: k, label: title("OFFRES"), value: `${ctx.coupons} disponible${ctx.coupons > 1 ? "s" : ""}` } : null;
    case "custom":
      return cfg.value ? { key: k, label: (cfg.label ?? "").toUpperCase(), value: cfg.value } : null;
    default:
      return null;
  }
}

/** Remplit toutes les zones d'une carte selon la disposition de l'éditeur. null = disposition automatique (d'avant). */
export function resolveSlots(
  design: Pick<CardDesign, "layout" | "labelBalance" | "labelCustomer" | "labelReward">,
  state: CardState,
  ctx: SlotContext,
): ResolvedSlots | null {
  const slots = design.layout?.slots;
  if (!slots) return null;
  const labels = fieldLabels(design, state);
  const get = (key: FieldSlot) => slotField(key, slots[key], state, labels, ctx);
  const foot = slots.foot ?? { src: "sentence" as const };
  return {
    top: get("top"),
    bottom: [get("b1"), get("b2"), get("b3"), get("b4")],
    footer: foot.src === "sentence" ? state.sentence : foot.src === "custom" ? foot.value || null : null,
  };
}

/**
 * Disposition automatique (cartes enregistrées avant l'éditeur visuel), au même format que les zones :
 * permet à l'aperçu de n'avoir qu'une seule façon de dessiner la carte.
 */
export function autoSlots(design: Pick<CardDesign, "labelBalance" | "labelCustomer" | "labelReward">, state: CardState, customerName: string): ResolvedSlots {
  const labels = fieldLabels(design, state);
  const pf = posterFields(state, labels, customerName);
  const bottom: (Field | null)[] = [...pf.primary.slice(0, 4)];
  while (bottom.length < 4) bottom.push(null);
  return { top: pf.header, bottom, footer: pf.footer };
}

/**
 * Les règles de la carte en phrases simples (pour le tableau de bord, le guide et le dos de la carte).
 */
export function describeProgram(
  program: Pick<
    Program,
    | "mode" | "reward_threshold" | "reward_description" | "points_per_euro" | "cashback_percent" | "tiers_enabled" | "tier_basis"
    | "progress_style" | "max_stamps_per_day" | "signup_bonus" | "streak_enabled" | "streak_goal" | "streak_bonus"
    | "streak_reminder_dow" | "streak_reminder_hour" | "lap_times_enabled" | "referral_bonus" | "bonus_multiplier"
    | "bonus_start_hour" | "bonus_end_hour" | "welcome_offer" | "birthday_offer"
  >,
  tiers: Pick<Tier, "name" | "min_value" | "perk">[] = [],
): { icon: string; title: string; text: string }[] {
  const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const unit = program.mode === "stamps" ? (program.progress_style === "track" ? "secteur" : "tampon") : program.mode === "points" ? "point" : "€";
  const units = (n: number) => (unit === "€" ? `${n} €` : `${n} ${unit}${n > 1 ? "s" : ""}`);
  const out: { icon: string; title: string; text: string }[] = [];
  if (program.mode === "stamps") {
    out.push(
      program.progress_style === "track"
        ? {
            icon: "🏁",
            title: "Progression",
            text: `Chaque passage scanné allume 1 secteur du circuit. ${program.reward_threshold} secteurs = 1 tour bouclé = ${program.reward_description}. Puis un nouveau tour commence.`,
          }
        : {
            icon: "🎟️",
            title: "Comment ça marche",
            text: `Un tampon à chaque passage, quand on scanne ta carte en caisse. Au ${program.reward_threshold}e : ${program.reward_description}. Puis une nouvelle carte commence.`,
          },
    );
    out.push({
      icon: "👍",
      title: "Bon à savoir",
      text:
        program.max_stamps_per_day > 1
          ? `Jusqu'à ${program.max_stamps_per_day} ${unit}s par jour.`
          : `Un ${unit} par jour au maximum, même si tu passes plusieurs fois.`,
    });
  } else if (program.mode === "points") {
    out.push({
      icon: "⭐",
      title: "Comment ça marche",
      text: `${Number(program.points_per_euro)} point${Number(program.points_per_euro) > 1 ? "s" : ""} par euro dépensé. Échange-les contre les cadeaux de la liste, quand tu veux.`,
    });
  } else {
    out.push({
      icon: "💶",
      title: "Comment ça marche",
      text: `${Number(program.cashback_percent)} % de chaque achat s'ajoutent à ta cagnotte. Utilise-la en réduction quand tu veux.`,
    });
  }
  if (program.signup_bonus > 0 && program.mode !== "cashback") {
    out.push({
      icon: "🎁",
      title: "Cadeau de bienvenue",
      text: `${program.signup_bonus} ${unit}${program.signup_bonus > 1 ? "s" : ""} offert${program.signup_bonus > 1 ? "s" : ""} dès l'inscription.`,
    });
  }
  if (program.tiers_enabled && tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => Number(a.min_value) - Number(b.min_value));
    out.push({
      icon: "🏆",
      title: "Niveaux",
      text: sorted
        .map((t) => `${t.name} dès ${program.tier_basis === "spend" ? formatEuro(Number(t.min_value)) + " dépensés" : `${Number(t.min_value)} passage${Number(t.min_value) > 1 ? "s" : ""}`}${t.perk ? ` (${t.perk})` : ""}`)
        .join(" → ") + ". Ton niveau se met à jour tout seul après chaque passage.",
    });
  }
  if (program.streak_enabled) {
    out.push({
      icon: "🔥",
      title: "Série",
      text: `Viens au moins une fois par semaine (du lundi au dimanche) : toutes les ${program.streak_goal} semaines d'affilée, tu gagnes ${units(program.streak_bonus)} en plus. Petit rappel le ${days[program.streak_reminder_dow]} à ${program.streak_reminder_hour} h si tu n'es pas encore passé.`,
    });
  }
  if (program.lap_times_enabled) {
    out.push({
      icon: "⏱️",
      title: "Record et classement",
      text: "Après ta session, ton meilleur tour est enregistré en caisse : ta carte affiche ton record et ta place au classement (P1, P2…). Si quelqu'un te dépasse, tu es prévenu.",
    });
  }
  if (program.referral_bonus > 0) out.push({ icon: "🤝", title: "Parrainage", text: `${units(program.referral_bonus)} en plus pour toi à la 1re visite de l'ami que tu invites.` });
  if (program.bonus_multiplier > 1 && program.bonus_start_hour != null) {
    out.push({ icon: "⚡", title: "Heures boostées", text: `Tes gains sont multipliés par ${program.bonus_multiplier} de ${program.bonus_start_hour} h à ${program.bonus_end_hour} h.` });
  }
  if (program.welcome_offer) out.push({ icon: "👋", title: "Bienvenue", text: program.welcome_offer });
  if (program.birthday_offer) out.push({ icon: "🎂", title: "Anniversaire", text: program.birthday_offer });
  return out;
}
