/**
 * Ce que la carte doit afficher, selon le mode de récompense.
 * Utilisé partout (carte Apple, carte Google, carte web, aperçu, scanner) pour que
 * toutes les versions de la carte disent exactement la même chose.
 */
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
  else if (left <= 2) sentence = `Plus que ${left} tampon${left > 1 ? "s" : ""} avant ton cadeau : ${program.reward_description} !`;
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

/** Réglages de design d'un programme, au format de l'aperçu. */
export function designFromProgram(program: Program) {
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
  };
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
