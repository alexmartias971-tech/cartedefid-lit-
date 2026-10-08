/**
 * État de l'éditeur de carte (v2) : tout ce que le commerçant règle, au même endroit.
 * Tous les champs sont « contrôlés » : rien n'est perdu si l'enregistrement échoue.
 */
import { layoutOf } from "@/lib/card-state";
import { defaultSlots, type ArtFormat, type CardLayout } from "@/lib/layout";
import type { Business, CatalogReward, Program, RewardMode, Tier } from "@/lib/types";
import { AMBIANCES, TRADES, type Trade } from "./content";
import { newKey } from "./shared";

/**
 * Une image de l'éditeur : adresse d'aperçu (locale ou en ligne), adresse envoyée, envoi en cours,
 * et `saved` = la dernière adresse valide (on y revient si un envoi échoue : rien n'est perdu).
 */
export type ImageSlot = { preview: string | null; remote: string | null; uploading: boolean; error?: string | null; saved: string | null };
export const emptyImage = (remote: string | null = null): ImageSlot => ({ preview: remote, remote, uploading: false, error: null, saved: remote });

export type TierDraft = { key: string; id?: string; name: string; min_value: string; perk: string; color: string; image: ImageSlot };
export type RewardDraft = { key: string; id?: string; name: string; cost: string };

export type Draft = {
  trade: string;
  /** Le métier a été choisi (nouvelle carte ou choix explicite) : il est alors enregistré. */
  tradeChosen: boolean;
  // Le commerce
  name: string;
  program_name: string;
  /** Le titre suit la promesse (« 10 passages = 1 café offert ») tant qu'on ne l'a pas modifié. */
  titleAuto: boolean;
  show_logo_text: boolean;
  // La récompense
  mode: RewardMode;
  reward_description: string;
  reward_threshold: number;
  points_per_euro: number;
  cashback_percent: number;
  catalog: RewardDraft[];
  signup_bonus: number;
  max_stamps_per_day: number;
  max_purchase_amount: number;
  // Le look
  background_color: string;
  foreground_color: string;
  label_color: string;
  stamp_color: string;
  strip_overlay: number;
  photo_focus: Program["photo_focus"];
  progress_style: Program["progress_style"];
  icon_preset: string;
  collection: string[];
  reward_on_last: boolean;
  layout: CardLayout;
  // Infos (dos de la carte)
  phone: string;
  email: string;
  address: string;
  google_review_url: string;
  instagram: string;
  latitude: string;
  longitude: string;
  relevant_text: string;
  back_text: string;
  // Bonus
  welcome_offer: string;
  birthday_offer: string;
  max_notifications_per_week: number;
  referral_bonus: number;
  bonus_multiplier: number;
  bonus_start_hour: number;
  bonus_end_hour: number;
  tiers_enabled: boolean;
  tier_basis: "visits" | "spend";
  tiers: TierDraft[];
  streak_enabled: boolean;
  streak_goal: number;
  streak_bonus: number;
  streak_reminder_dow: number;
  streak_reminder_hour: number;
  lap_times_enabled: boolean;
  /** Réglages d'avant l'éditeur v2, renvoyés tels quels pour ne rien perdre. */
  legacy: {
    label_balance: string;
    label_customer: string;
    label_reward: string;
    decor_preset: string;
    vessel: string;
    fill_color: string;
    stamps_position: string;
    stamp_icon_url: string | null;
    stamp_empty_icon_url: string | null;
    /** La carte utilisait le circuit (karting) à l'ouverture. */
    track: boolean;
  };
};

export type Images = { logo: ImageSlot; strip: ImageSlot; bg: Partial<Record<ArtFormat, ImageSlot>> };

/** Promesse de la carte (titre Android, récapitulatif). */
export function promise(d: Pick<Draft, "mode" | "reward_threshold" | "reward_description" | "points_per_euro" | "cashback_percent">): string {
  let text: string;
  if (d.mode === "points") text = `${fmtNum(d.points_per_euro)} point${d.points_per_euro > 1 ? "s" : ""} par euro = des cadeaux`;
  else if (d.mode === "cashback") text = `${fmtNum(d.cashback_percent)} % de tes achats en cagnotte`;
  else text = d.reward_description.trim() ? `${d.reward_threshold} tampons = ${d.reward_description.trim()}` : "Carte fidélité";
  if (text.length <= 40) return text;
  // 40 caractères au maximum (titre de la carte) : coupé au dernier mot entier
  const cut = text.slice(0, 39);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : 39).trim()}…`;
}

export const fmtNum = (n: number) => String(Number(n)).replace(".", ",");

/** Tampons offerts au départ conseillés : 2 sur une carte de 10 cases ou plus, 1 sinon. */
export const suggestedStart = (threshold: number) => (threshold >= 10 ? 2 : 1);

/** Disposition conseillée des infos : ce qui reste avant le cadeau, puis le cadeau (le prénom n'est plus affiché par défaut). */
export function recommendedSlots(f: { tiers: boolean; streak: boolean; lap: boolean }): NonNullable<CardLayout["slots"]> {
  if (f.lap || f.streak || f.tiers) return defaultSlots(f);
  return { top: { src: "remaining" }, b1: { src: "reward" }, b2: { src: "offers" }, b3: { src: "none" }, b4: { src: "none" }, foot: { src: "none" } };
}

function instagramHandle(url: string | null | undefined): string {
  if (!url) return "";
  const m = /instagram\.com\/([\w.]+)/i.exec(url);
  return m ? `@${m[1]}` : url;
}

/** État de départ : la carte existante, ou une nouvelle carte (modèle « Café » par défaut). */
export function initialDraft(business?: Business, program?: Program, tiers: Tier[] = [], catalog: CatalogReward[] = []): Draft {
  const saved = program ? layoutOf(program) : null;
  // Carte existante sans métier enregistré : on le déduit (karting → sport), sans l'enregistrer tant qu'on n'en choisit pas un
  const guessed = program ? (program.lap_times_enabled || program.progress_style === "track" ? "sport" : "autre") : TRADES[0].id;
  const trade = TRADES.find((t) => t.id === (saved?.trade ?? guessed)) ?? TRADES[0];
  const amb = AMBIANCES.find((a) => a.id === trade.ambiance) ?? AMBIANCES[0];
  const features = { tiers: !!program?.tiers_enabled, streak: !!program?.streak_enabled, lap: !!program?.lap_times_enabled };
  const layout: CardLayout = saved
    ? // « look » est fixé dès l'ouverture (l'apparence ne change pas : icônes comme avant), ce qui marque la carte comme v2
      { ...saved, slots: saved.slots ?? defaultSlots(features), look: saved.look ?? "icons" }
    : { layers: [], slots: recommendedSlots(features), look: "classic", fill: "aurore", trade: trade.id };
  const threshold = program?.reward_threshold ?? trade.threshold;
  const d: Draft = {
    trade: trade.id,
    tradeChosen: !program || !!saved?.trade,
    name: business?.name ?? "",
    program_name: program?.name ?? "",
    titleAuto: !program,
    show_logo_text: program?.show_logo_text ?? true,
    mode: program?.mode ?? trade.mode,
    reward_description: program?.reward_description ?? trade.reward,
    reward_threshold: threshold,
    points_per_euro: Number(program?.points_per_euro ?? 1),
    cashback_percent: Number(program?.cashback_percent ?? 5),
    catalog:
      catalog.length > 0
        ? catalog.map((r) => ({ key: newKey(), id: r.id, name: r.name, cost: String(r.cost) }))
        : program
          ? []
          : [
              { key: newKey(), name: "1 boisson offerte", cost: "50" },
              { key: newKey(), name: "1 dessert offert", cost: "100" },
            ],
    signup_bonus: program?.signup_bonus ?? suggestedStart(threshold),
    max_stamps_per_day: program?.max_stamps_per_day ?? 1,
    max_purchase_amount: Number(program?.max_purchase_amount ?? 1000),
    background_color: program?.background_color ?? amb.background_color,
    foreground_color: program?.foreground_color ?? amb.foreground_color,
    label_color: program?.label_color ?? amb.label_color,
    stamp_color: program?.stamp_color ?? amb.stamp_color,
    strip_overlay: program?.strip_overlay ?? 0,
    photo_focus: program?.photo_focus ?? "center",
    progress_style: program?.progress_style ?? "glass",
    icon_preset: program?.icon_preset ?? trade.icon,
    // Carte existante : on garde exactement ses icônes (même vides : les anciens styles utilisent alors l'icône principale)
    collection: program ? (program.collection_icons ?? []) : [trade.icon],
    reward_on_last: program?.reward_on_last ?? true,
    layout,
    phone: business?.phone ?? "",
    email: business?.email ?? "",
    address: business?.address ?? "",
    google_review_url: business?.google_review_url ?? "",
    instagram: instagramHandle(business?.instagram_url),
    latitude: business?.latitude != null ? String(business.latitude) : "",
    longitude: business?.longitude != null ? String(business.longitude) : "",
    relevant_text: business?.relevant_text ?? "",
    back_text: program?.back_text ?? "",
    welcome_offer: program?.welcome_offer ?? "",
    birthday_offer: program?.birthday_offer ?? "",
    max_notifications_per_week: business?.max_notifications_per_week ?? 2,
    referral_bonus: program?.referral_bonus ?? 0,
    bonus_multiplier: program?.bonus_multiplier ?? 1,
    bonus_start_hour: program?.bonus_start_hour ?? 14,
    bonus_end_hour: program?.bonus_end_hour ?? 17,
    tiers_enabled: program?.tiers_enabled ?? false,
    tier_basis: program?.tier_basis ?? "visits",
    tiers: tiers.map((t) => ({
      key: newKey(),
      id: t.id,
      name: t.name,
      min_value: String(t.min_value),
      perk: t.perk ?? "",
      color: t.color ?? "",
      image: emptyImage(t.image_url),
    })),
    streak_enabled: program?.streak_enabled ?? false,
    streak_goal: program?.streak_goal ?? 4,
    streak_bonus: program?.streak_bonus ?? 1,
    streak_reminder_dow: program?.streak_reminder_dow ?? 0,
    streak_reminder_hour: program?.streak_reminder_hour ?? 11,
    lap_times_enabled: program?.lap_times_enabled ?? false,
    legacy: {
      label_balance: program?.label_balance ?? "",
      label_customer: program?.label_customer ?? "",
      label_reward: program?.label_reward ?? "",
      decor_preset: program?.decor_preset ?? "none",
      vessel: program?.vessel ?? "glass",
      fill_color: program?.fill_color ?? "#8FD16A",
      stamps_position: program?.stamps_position ?? "bottom",
      stamp_icon_url: program?.stamp_icon_url ?? null,
      stamp_empty_icon_url: program?.stamp_empty_icon_url ?? null,
      track: program?.progress_style === "track",
    },
  };
  if (!d.program_name) d.program_name = promise(d);
  return d;
}

export function initialImages(business?: Business, program?: Program): Images {
  const saved = program ? layoutOf(program) : null;
  const bg: Images["bg"] = {};
  for (const [k, url] of Object.entries(saved?.bg ?? {})) if (url) bg[k as ArtFormat] = emptyImage(url);
  return { logo: emptyImage(business?.logo_url ?? null), strip: emptyImage(program?.strip_image_url ?? null), bg };
}

/** Applique un modèle de métier (sans toucher au nom, au logo ni aux photos). */
export function applyTrade(d: Draft, trade: Trade): Draft {
  const amb = AMBIANCES.find((a) => a.id === trade.ambiance) ?? AMBIANCES[0];
  const next: Draft = {
    ...d,
    trade: trade.id,
    mode: trade.mode,
    reward_threshold: trade.threshold,
    reward_description: trade.reward || d.reward_description,
    signup_bonus: suggestedStart(trade.threshold),
    icon_preset: trade.icon,
    collection: [trade.icon],
    background_color: amb.background_color,
    foreground_color: amb.foreground_color,
    label_color: amb.label_color,
    stamp_color: amb.stamp_color,
    lap_times_enabled: trade.id === "sport" ? d.lap_times_enabled : false,
    progress_style: d.progress_style === "track" && trade.id !== "sport" ? "glass" : d.progress_style,
    layout: { ...d.layout, trade: trade.id },
    tradeChosen: true,
    catalog: d.catalog.length > 0 ? d.catalog : [
      { key: newKey(), name: "1 boisson offerte", cost: "50" },
      { key: newKey(), name: "1 dessert offert", cost: "100" },
    ],
  };
  if (next.titleAuto) next.program_name = promise(next);
  return next;
}

/** Ce qui manque pour pouvoir publier, étape par étape (0 = commerce, 1 = récompense…). */
export function missing(d: Draft, images: Images): { step: number; field: string; message: string }[] {
  const out: { step: number; field: string; message: string }[] = [];
  if (!d.name.trim()) out.push({ step: 0, field: "name", message: "Indiquez le nom de votre commerce." });
  if (d.mode === "stamps" && !d.reward_description.trim())
    out.push({ step: 1, field: "reward", message: "Choisissez le cadeau gagné quand la carte est pleine." });
  if (d.mode === "points" && !d.catalog.some((r) => r.name.trim() && Number(r.cost) > 0))
    out.push({ step: 1, field: "catalog", message: "Ajoutez au moins un cadeau à échanger contre des points." });
  if (d.bonus_multiplier > 1 && !(d.bonus_end_hour > d.bonus_start_hour))
    out.push({ step: 3, field: "happy", message: "Heures calmes : l'heure de fin doit être après l'heure de début." });
  if (d.tiers_enabled && !d.tiers.some((t) => t.name.trim()))
    out.push({ step: 3, field: "tiers", message: "Ajoutez au moins un niveau, ou désactivez les niveaux." });
  const uploading = images.logo.uploading || images.strip.uploading || Object.values(images.bg).some((b) => b?.uploading) || d.tiers.some((t) => t.image.uploading);
  if (uploading) out.push({ step: -1, field: "upload", message: "Une image est encore en cours d'envoi, patientez un instant." });
  return out;
}

const HANDLE = /^@?([\w.]{1,30})$/;

/** Prépare l'envoi au serveur (mêmes noms de champs que le formulaire d'origine). */
export function toFormData(d: Draft, images: Images, businessId?: string): FormData {
  const fd = new FormData();
  const put = (k: string, v: string | number) => fd.append(k, String(v));
  const flag = (k: string, v: boolean) => v && fd.append(k, "on");
  put("business_id", businessId ?? "");
  put("name", d.name.trim());
  put("program_name", (d.program_name.trim() || promise(d)).slice(0, 40));
  put("mode", d.mode);
  put("reward_description", d.reward_description.trim());
  put("reward_threshold", d.reward_threshold);
  put("points_per_euro", d.points_per_euro);
  put("cashback_percent", d.cashback_percent);
  put("max_purchase_amount", d.max_purchase_amount);
  put("max_stamps_per_day", d.max_stamps_per_day);
  put("max_notifications_per_week", d.max_notifications_per_week);
  put("signup_bonus", d.mode === "stamps" ? Math.min(d.signup_bonus, Math.max(0, d.reward_threshold - 1)) : d.signup_bonus);
  put("background_color", d.background_color);
  put("foreground_color", d.foreground_color);
  put("label_color", d.label_color);
  put("stamp_color", d.stamp_color);
  put("strip_overlay", d.strip_overlay);
  put("photo_focus", d.photo_focus);
  put("progress_style", d.progress_style);
  put("stamps_position", d.legacy.stamps_position);
  put("icon_preset", d.icon_preset);
  put("collection_icons", d.collection.join(","));
  put("decor_preset", d.legacy.decor_preset);
  put("vessel", d.legacy.vessel);
  put("fill_color", d.legacy.fill_color);
  flag("reward_on_last", d.reward_on_last);
  flag("show_logo_text", d.show_logo_text);
  put("label_balance", d.legacy.label_balance);
  put("label_customer", d.legacy.label_customer);
  put("label_reward", d.legacy.label_reward);
  put("phone", d.phone.trim());
  put("email", d.email.trim());
  put("address", d.address.trim());
  put("google_review_url", d.google_review_url.trim());
  const insta = d.instagram.trim();
  const h = HANDLE.exec(insta) ?? /instagram\.com\/([\w.]+)/i.exec(insta);
  put("instagram_url", h ? `https://instagram.com/${h[1]}` : insta);
  put("latitude", d.latitude.trim());
  put("longitude", d.longitude.trim());
  put("relevant_text", d.relevant_text.trim());
  put("back_text", d.back_text.trim());
  put("welcome_offer", d.welcome_offer.trim());
  put("birthday_offer", d.birthday_offer.trim());
  put("referral_bonus", d.referral_bonus);
  put("bonus_multiplier", d.bonus_multiplier);
  put("bonus_start_hour", d.bonus_start_hour);
  put("bonus_end_hour", d.bonus_end_hour);
  flag("tiers_enabled", d.tiers_enabled);
  put("tier_basis", d.tier_basis);
  flag("streak_enabled", d.streak_enabled);
  put("streak_goal", d.streak_goal);
  put("streak_bonus", d.streak_bonus);
  put("streak_reminder_dow", d.streak_reminder_dow);
  put("streak_reminder_hour", d.streak_reminder_hour);
  flag("lap_times_enabled", d.lap_times_enabled);
  put(
    "tiers_json",
    JSON.stringify(
      d.tiers.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        min_value: Number(t.min_value) || 0,
        perk: t.perk,
        color: t.color,
        image_url: t.image.remote ?? t.image.saved,
        remove_image: !t.image.remote && !t.image.saved,
      })),
    ),
  );
  if (d.mode === "points") put("catalog_json", JSON.stringify(d.catalog.map((r) => ({ id: r.id, key: r.key, name: r.name, cost: Number(r.cost) }))));
  // Images : adresses déjà envoyées (ou retrait)
  // Une image n'est retirée que si on l'a retirée (jamais à cause d'un envoi raté : on garde la dernière valide)
  const keep = (slot: ImageSlot | undefined) => slot?.remote ?? slot?.saved ?? null;
  if (keep(images.logo)) put("logo_url", keep(images.logo)!);
  else flag("remove_logo", true);
  if (keep(images.strip)) put("strip_image_url", keep(images.strip)!);
  else flag("remove_strip_image", true);
  const bg: CardLayout["bg"] = {};
  for (const [k, slot] of Object.entries(images.bg)) if (keep(slot)) bg[k as ArtFormat] = keep(slot)!;
  const layout: CardLayout = { ...d.layout, bg };
  if (d.tradeChosen) layout.trade = d.trade;
  else delete layout.trade;
  put("card_layout", JSON.stringify(layout));
  return fd;
}
