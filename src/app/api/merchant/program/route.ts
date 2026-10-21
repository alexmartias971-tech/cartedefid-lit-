import { after } from "next/server";
import { describeProgram } from "@/lib/card-state";
import { getMerchantSession, type MerchantSession } from "@/lib/merchant-session";
import { getMerchantRole } from "@/lib/merchant-role";
import { expired, json, resyncProgramCards, UUID } from "@/lib/merchant-space";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, CatalogReward, Program, Tier } from "@/lib/types";
import { getWaltyPlan, planRefused, type PlanId } from "@/lib/walty-plan";

/**
 * « Mon programme » dans l'espace commerçant de walty.fr : les règles de la carte, à lire et à modifier.
 * - Modifiable par le commerçant : le cadeau, le nombre de passages, les gains par euro, les offres de bienvenue
 *   et d'anniversaire, les heures boostées, les bonus, le catalogue de cadeaux (sans suppression), ses coordonnées.
 * - Jamais ici (« Demander à Walty ») : le mode (tampons / points / cashback), le design, le nom de la carte,
 *   les niveaux, l'activation ou la pause de la carte, les suppressions.
 * - Les modifications demandent l'accès « gérant » (celui qui peut envoyer des messages) et une session active.
 * Mêmes vérifications que le tableau de bord admin ; les cartes des clients se mettent à jour ensuite.
 * - Formule Essentiel (voir src/lib/walty-plan.ts) : l'offre d'anniversaire, le bonus de parrainage et le lien d'avis Google
 *   ne se modifient pas ici (403 « Tout compris ») ; « plan » est renvoyé pour que walty.fr masque ces champs.
 */

type Loaded = { business: Business; program: Program; tiers: Tier[]; catalog: CatalogReward[] };

async function load(businessId: string): Promise<Loaded | null> {
  const supabase = createAdminClient();
  const [{ data: business }, { data: programData }] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", businessId).single(),
    supabase.from("loyalty_programs").select("*, program_tiers(*), reward_catalog(*)").eq("business_id", businessId).maybeSingle(),
  ]);
  if (!business || !programData) return null;
  const { program_tiers: tiers = [], reward_catalog: catalog = [], ...program } = programData as Program & {
    program_tiers?: Tier[];
    reward_catalog?: CatalogReward[];
  };
  return {
    business: business as Business,
    program: program as Program,
    tiers: [...tiers].sort((a, b) => Number(a.min_value) - Number(b.min_value)),
    catalog: [...catalog].sort((a, b) => a.sort - b.sort || a.cost - b.cost),
  };
}

function view(d: Loaded, session: MerchantSession, plan: PlanId) {
  const p = d.program;
  return {
    ok: true,
    canEdit: session.canSendNotifications,
    plan,
    updated_at: p.updated_at,
    settings: {
      reward_description: p.reward_description,
      reward_threshold: p.reward_threshold,
      points_per_euro: Number(p.points_per_euro),
      cashback_percent: Number(p.cashback_percent),
      max_purchase_amount: Number(p.max_purchase_amount),
      max_stamps_per_day: p.max_stamps_per_day,
      welcome_offer: p.welcome_offer ?? "",
      birthday_offer: p.birthday_offer ?? "",
      signup_bonus: p.signup_bonus ?? 0,
      referral_bonus: p.referral_bonus ?? 0,
      bonus_multiplier: p.bonus_multiplier ?? 1,
      bonus_start_hour: p.bonus_start_hour,
      bonus_end_hour: p.bonus_end_hour,
      streak_goal: p.streak_goal ?? 4,
      streak_bonus: p.streak_bonus ?? 1,
    },
    business: {
      phone: d.business.phone ?? "",
      address: d.business.address ?? "",
      google_review_url: d.business.google_review_url ?? "",
      instagram_url: d.business.instagram_url ?? "",
    },
    catalog: d.catalog.map((r) => ({ id: r.id, name: r.name, cost: r.cost, is_active: r.is_active })),
    locked: {
      mode: p.mode,
      name: p.name,
      is_active: p.is_active,
      tiers_enabled: p.tiers_enabled,
      tier_basis: p.tier_basis,
      tiers: d.program.tiers_enabled ? d.tiers.map((t) => ({ name: t.name, min_value: Number(t.min_value), perk: t.perk })) : [],
      streak_enabled: p.streak_enabled,
      lap_times_enabled: p.lap_times_enabled,
      max_notifications_per_week: d.business.max_notifications_per_week,
      business_name: d.business.name,
    },
    rules: describeProgram(p, d.tiers),
  };
}

export async function GET() {
  const session = await getMerchantSession();
  if (!session) return expired();
  // réservé au gérant (connexion e-mail + mot de passe), comme dans la passerelle walty.fr
  if (!(await getMerchantRole())?.manager) {
    return Response.json({ ok: false, error: "Réservé au gérant : connectez-vous avec votre e-mail et votre mot de passe." }, { status: 403 });
  }
  const d = await load(session.businessId);
  if (!d) return json({ ok: false, error: "Carte introuvable. Contactez Walty." }, 404);
  return json(view(d, session, (await getWaltyPlan(session.businessId)).plan));
}

type Body = {
  updated_at?: string;
  settings?: Record<string, unknown>;
  business?: Record<string, unknown>;
  catalog?: { id?: string; name?: string; cost?: number | string; is_active?: boolean }[];
};

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const numOf = (v: unknown) => Number.parseFloat(String(v ?? "").replace(",", "."));
const intOf = (v: unknown) => Number.parseInt(String(v ?? ""), 10);
const clampInt = (v: number, min: number, max: number, fallback: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
function safeUrl(v: unknown): string | null | false {
  const value = str(v, 300);
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : false;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const session = await getMerchantSession();
  if (!session) return expired();
  if (!session.canSendNotifications) {
    return json({ ok: false, error: "Les réglages se modifient avec l'accès du gérant. Demandez à Walty." }, 403);
  }
  // gérant prouvé (connexion par mot de passe) : un employé qui connaît le PIN ne peut pas changer le programme
  if (!(await getMerchantRole())?.manager) {
    return json({ ok: false, error: "Connectez-vous avec l'e-mail et le mot de passe du gérant pour modifier les réglages." }, 403);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return json({ ok: false, error: "Demande invalide." }, 415);
  }
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") return json({ ok: false, error: "Demande invalide." }, 400);

  const d = await load(session.businessId);
  if (!d) return json({ ok: false, error: "Carte introuvable. Contactez Walty." }, 404);
  const { program: p, business: b } = d;
  const { plan } = await getWaltyPlan(session.businessId);
  if (body.updated_at && body.updated_at !== p.updated_at) {
    return json({ ok: false, conflict: true, error: "Les réglages viennent d'être modifiés ailleurs (par Walty ?). Rechargez puis recommencez." }, 409);
  }

  const s = body.settings ?? {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(s, k);
  const mode = p.mode;

  // Même vérifications que le tableau de bord admin (saveBusiness)
  const reward = has("reward_description") ? str(s.reward_description, 120) : p.reward_description;
  const threshold = has("reward_threshold") ? intOf(s.reward_threshold) : p.reward_threshold;
  const pointsPerEuro = has("points_per_euro") ? numOf(s.points_per_euro) : Number(p.points_per_euro);
  const cashbackPercent = has("cashback_percent") ? numOf(s.cashback_percent) : Number(p.cashback_percent);
  const maxPurchase = has("max_purchase_amount") ? numOf(s.max_purchase_amount) : Number(p.max_purchase_amount);
  const maxStamps = has("max_stamps_per_day") ? intOf(s.max_stamps_per_day) : p.max_stamps_per_day;
  if (mode === "stamps" && reward.length < 2) return json({ ok: false, error: "Indiquez le cadeau obtenu avec les passages." }, 400);
  if (mode === "stamps" && !(threshold >= 2 && threshold <= 50)) return json({ ok: false, error: "Le nombre de passages doit être entre 2 et 50." }, 400);
  if (mode === "points" && !(pointsPerEuro > 0 && pointsPerEuro <= 100)) return json({ ok: false, error: "Points par euro : entre 0,1 et 100." }, 400);
  if (mode === "cashback" && !(cashbackPercent > 0 && cashbackPercent <= 50)) return json({ ok: false, error: "Cagnotte : entre 0,1 % et 50 %." }, 400);
  if (mode !== "stamps" && !(maxPurchase >= 1 && maxPurchase <= 100000)) return json({ ok: false, error: "Montant maximum d'un achat : entre 1 et 100 000 €." }, 400);
  if (!(maxStamps >= 1 && maxStamps <= 10)) return json({ ok: false, error: "Passages par jour : entre 1 et 10." }, 400);

  const multiplier = has("bonus_multiplier") ? clampInt(intOf(s.bonus_multiplier), 1, 3, 1) : p.bonus_multiplier ?? 1;
  const startHour = has("bonus_start_hour") ? intOf(s.bonus_start_hour) : p.bonus_start_hour ?? NaN;
  const endHour = has("bonus_end_hour") ? intOf(s.bonus_end_hour) : p.bonus_end_hour ?? NaN;
  if (multiplier > 1 && !(startHour >= 0 && startHour <= 23 && endHour >= 1 && endHour <= 24 && endHour > startHour)) {
    return json({ ok: false, error: "Heures boostées : l'heure de fin doit être après l'heure de début." }, 400);
  }
  const signupBonus = has("signup_bonus") ? clampInt(intOf(s.signup_bonus), 0, 1000, 0) : p.signup_bonus ?? 0;

  const programFields: Record<string, unknown> = {
    welcome_offer: has("welcome_offer") ? str(s.welcome_offer, 120) || null : p.welcome_offer,
    birthday_offer: has("birthday_offer") ? str(s.birthday_offer, 120) || null : p.birthday_offer,
    max_stamps_per_day: maxStamps,
    // En mode tampons, le bonus d'inscription ne peut pas offrir le cadeau directement
    signup_bonus: mode === "stamps" ? Math.min(signupBonus, Math.max(0, threshold - 1)) : mode === "points" ? signupBonus : 0,
    referral_bonus: has("referral_bonus") ? clampInt(intOf(s.referral_bonus), 0, 1000, 0) : p.referral_bonus ?? 0,
    bonus_multiplier: multiplier,
    bonus_start_hour: multiplier > 1 ? startHour : null,
    bonus_end_hour: multiplier > 1 ? endHour : null,
  };
  if (mode === "stamps") Object.assign(programFields, { reward_description: reward, reward_threshold: threshold });
  if (mode === "points") Object.assign(programFields, { points_per_euro: pointsPerEuro, max_purchase_amount: maxPurchase });
  if (mode === "cashback") Object.assign(programFields, { cashback_percent: cashbackPercent, max_purchase_amount: maxPurchase });
  if (p.streak_enabled) {
    if (has("streak_goal")) programFields.streak_goal = clampInt(intOf(s.streak_goal), 2, 52, p.streak_goal ?? 4);
    if (has("streak_bonus")) programFields.streak_bonus = clampInt(intOf(s.streak_bonus), 0, 1000, p.streak_bonus ?? 1);
  }

  // Coordonnées du commerce (dos de la carte)
  const bz = body.business ?? {};
  const bHas = (k: string) => Object.prototype.hasOwnProperty.call(bz, k);
  const businessFields: Record<string, unknown> = {};
  if (bHas("phone")) {
    const phone = str(bz.phone, 30);
    if (phone && !/^[+\d][\d .()-]{5,29}$/.test(phone)) return json({ ok: false, error: "Numéro de téléphone invalide." }, 400);
    businessFields.phone = phone || null;
  }
  if (bHas("address")) businessFields.address = str(bz.address, 200) || null;
  for (const key of ["google_review_url", "instagram_url"] as const) {
    if (!bHas(key)) continue;
    const url = safeUrl(bz[key]);
    if (url === false) return json({ ok: false, error: key === "instagram_url" ? "Lien Instagram invalide (il doit commencer par https://)." : "Lien d'avis Google invalide (il doit commencer par https://)." }, 400);
    businessFields[key] = url;
  }

  // Formule Essentiel : anniversaire, parrainage et lien d'avis Google restent tels quels (Tout compris seulement)
  if (plan === "essentiel") {
    const changed =
      (has("birthday_offer") && (programFields.birthday_offer ?? null) !== (p.birthday_offer ?? null)) ||
      (has("referral_bonus") && programFields.referral_bonus !== (p.referral_bonus ?? 0)) ||
      (bHas("google_review_url") && (businessFields.google_review_url ?? null) !== (safeUrl(b.google_review_url) || null));
    if (changed) return planRefused();
  }

  // Catalogue de cadeaux (mode points) : modifier, ajouter, masquer. Pas de suppression ici.
  type CatalogChange = { id?: string; name: string; cost: number; is_active: boolean };
  let catalogChanges: CatalogChange[] | null = null;
  if (mode === "points" && Array.isArray(body.catalog)) {
    const known = new Map(d.catalog.map((r) => [r.id, r]));
    const list: CatalogChange[] = [];
    for (const r of body.catalog.slice(0, 30)) {
      const name = str(r?.name, 60);
      const cost = Math.round(numOf(r?.cost));
      const id = typeof r?.id === "string" && r.id ? r.id : undefined;
      if (id && (!UUID.test(id) || !known.has(id))) return json({ ok: false, error: "Cadeau inconnu. Rechargez la page." }, 400);
      if (!name && !id) continue;
      if (!name) return json({ ok: false, error: "Chaque cadeau doit avoir un nom." }, 400);
      if (!(cost >= 1 && cost <= 100000)) return json({ ok: false, error: `« ${name} » : le prix en points doit être entre 1 et 100 000.` }, 400);
      list.push({ id, name, cost, is_active: r?.is_active !== false });
    }
    // Les cadeaux non envoyés restent tels quels (jamais supprimés)
    const sent = new Set(list.filter((r) => r.id).map((r) => r.id));
    const untouched = d.catalog.filter((r) => !sent.has(r.id));
    if (list.filter((r) => r.is_active).length + untouched.filter((r) => r.is_active).length === 0) {
      return json({ ok: false, error: "Gardez au moins un cadeau proposé dans le catalogue." }, 400);
    }
    if (list.filter((r) => !r.id).length + d.catalog.length > 20) return json({ ok: false, error: "20 cadeaux au maximum." }, 400);
    catalogChanges = list;
  }

  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from("loyalty_programs")
    .update(programFields)
    .eq("id", p.id)
    .eq("business_id", session.businessId)
    .select("*")
    .single();
  if (error || !updated) {
    console.error("[espace program]", error?.message);
    return json({ ok: false, error: "Enregistrement impossible. Réessayez." }, 500);
  }
  if (Object.keys(businessFields).length > 0) {
    const { error: bErr } = await supabase.from("businesses").update(businessFields).eq("id", session.businessId);
    if (bErr) {
      console.error("[espace business]", bErr.message);
      return json({ ok: false, error: "Vos coordonnées n'ont pas pu être enregistrées. Réessayez." }, 500);
    }
  }
  if (catalogChanges) {
    let sort = d.catalog.length;
    for (const r of catalogChanges) {
      const res = r.id
        ? await supabase.from("reward_catalog").update({ name: r.name, cost: r.cost, is_active: r.is_active }).eq("id", r.id).eq("program_id", p.id)
        : await supabase.from("reward_catalog").insert({ program_id: p.id, name: r.name, cost: r.cost, is_active: r.is_active, sort: sort++ });
      if (res.error) {
        console.error("[espace catalog]", res.error.message);
        return json({ ok: false, error: "Le catalogue n'a pas pu être enregistré entièrement. Réessayez." }, 500);
      }
    }
  }
  console.info("[espace program] modifié par l'accès", session.scannerId, "commerce", session.businessId);

  const fresh = await load(session.businessId);
  if (!fresh) return json({ ok: false, error: "Carte introuvable." }, 404);
  // Les cartes déjà dans les téléphones se mettent à jour en arrière-plan
  after(() => resyncProgramCards(fresh.program, fresh.business));
  return json({ ...view(fresh, session, plan), done: "Enregistré ✓ Les cartes de vos clients se mettent à jour dans quelques instants." });
}
