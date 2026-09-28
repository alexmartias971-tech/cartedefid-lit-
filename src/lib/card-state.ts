/**
 * Ce que la carte doit afficher, selon le mode de récompense.
 * Utilisé partout (carte Apple, carte Google, carte web, aperçu, scanner) pour que
 * toutes les versions de la carte disent exactement la même chose.
 */
import { buildStripSvg, STRIP_H, STRIP_W, type StripOptions } from "@/lib/art";
import { buildBannerSvg, buildPosterSvg, FORMATS, type BannerFormat, type BannerOptions, type BannerStyle } from "@/lib/visual";
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
>;

type CardLike = {
  stamps_count: number;
  points_balance: number;
  cashback_balance: number;
  lifetime_visits: number;
  lifetime_spent: number;
  tier_id: string | null;
};

export type CardState = {
  /** Petit titre en haut à droite (ex : "TAMPONS"). */
  balanceLabel: string;
  /** Valeur en haut à droite (ex : "3/10", "120", "4,50 €"). */
  balanceValue: string;
  /** Pour les tampons : combien de cases remplies / au total. */
  stamps: { filled: number; total: number } | null;
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
};

export function computeCardState(
  program: ProgramLike,
  card: CardLike,
  tiers: Tier[] = [],
  catalog: CatalogReward[] = [],
): CardState {
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
    else if (nextReward) sentence = `Plus que ${nextReward.cost - points} points pour : ${nextReward.name}.`;
    return {
      balanceLabel: "POINTS",
      balanceValue: String(points),
      stamps: null,
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

  // Tampons
  const filled = Math.min(card.stamps_count, threshold);
  const left = threshold - card.stamps_count;
  let sentence = `Merci pour ta visite ! ${filled}/${threshold} tampons.`;
  if (card.stamps_count >= threshold) sentence = `🎁 Cadeau débloqué : ${program.reward_description} ! Montre ta carte en caisse.`;
  else if (card.stamps_count === 0) sentence = `${threshold} tampons = ${program.reward_description}.`;
  else if (left === 1) sentence = `Plus qu'un passage avant ton cadeau : ${program.reward_description} !`;
  else sentence = `Plus que ${left} passages avant ton cadeau : ${program.reward_description}.`;
  return {
    balanceLabel: "TAMPONS",
    balanceValue: `${filled}/${threshold}`,
    stamps: { filled, total: threshold },
    sentence,
    rule: `${threshold} tampons = ${program.reward_description}.`,
    tier,
    nextTier,
    rewardReady: card.stamps_count >= threshold,
    affordable: [],
  };
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
  if (program.mode === "cashback") return { label: "CASHBACK", value: `${Number(program.cashback_percent)} %` };
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
};

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
  const raw = design.progressStyle === "glass" || design.progressStyle === "minimal" ? "collection" : design.progressStyle;
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
  return style === "glass" || style === "minimal";
}

/** Options du moteur photo à partir du design (et d'une photo déjà convertie côté serveur). */
export function bannerOptions(
  design: CardDesign,
  progress: { total: number; filled: number },
  photo?: string | null,
): BannerOptions {
  const style: BannerStyle =
    design.mode === "cashback" ? "none" : design.progressStyle === "minimal" ? "minimal" : design.progressStyle === "none" ? "none" : "glass";
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
  };
}

/**
 * Bannière finale en SVG, au bon format (Apple 375×144 ou Google 375×122).
 * Les anciens styles (dessins) restent possibles : ils sont centrés dans le bon format.
 */
export function cardBannerSvg(
  design: CardDesign,
  progress: { total: number; filled: number },
  format: BannerFormat,
  width: number,
  height: number,
  uid: string,
  hrefs?: { decor?: string | null; icon?: string | null; iconEmpty?: string | null },
): string {
  if (isPhotoStyle(design.progressStyle) || design.mode === "cashback" || design.progressStyle === "none") {
    return buildBannerSvg(bannerOptions(design, progress, hrefs?.decor), format, width, height, uid);
  }
  const { w, h } = FORMATS[format];
  const legacy = buildStripSvg(stripOptions(design, progress, hrefs), STRIP_W, STRIP_H, uid);
  const inner = legacy.replace(/^<svg /, `<svg x="0" y="${(h - (w * STRIP_H) / STRIP_W) / 2}" `).replace(/width="\d+" height="\d+"/, `width="${w}" height="${(w * STRIP_H) / STRIP_W}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${design.backgroundColor}"/>${inner}</svg>`;
}

/** Visuel plein format de la carte poster iOS 27 (photo du niveau si elle existe). */
export function cardPosterSvg(
  design: CardDesign,
  width: number,
  height: number,
  uid: string,
  photo?: string | null,
  progress?: { total: number; filled: number },
): string {
  const base = bannerOptions(design, progress ?? { total: 0, filled: 0 }, photo !== undefined ? photo : design.stripImageUrl);
  return buildPosterSvg(progress ? base : { ...base, style: "none" }, width, height, uid);
}

/** Photo à utiliser : celle du niveau du client, sinon la photo principale. */
export function photoFor(program: Pick<Program, "strip_image_url">, tier: Tier | null): string | null {
  return tier?.image_url || program.strip_image_url;
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
        : `${program.reward_threshold} passages = ${program.reward_description}`;
  return program.welcome_offer ? `${base} · Bienvenue : ${program.welcome_offer}` : base;
}
