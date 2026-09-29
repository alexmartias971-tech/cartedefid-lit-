"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { loadCardBundlesByIds } from "@/lib/cards";
import { isGoogleConfigured } from "@/lib/env";
import { guadeloupeLocalToDate, isHexColor, slugify } from "@/lib/format";
import { upsertGoogleClass } from "@/lib/google/wallet";
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Program } from "@/lib/types";
import { syncCards } from "@/lib/wallet-sync";

export type FormState = { error?: string; ok?: string };

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optional = (fd: FormData, key: string) => text(fd, key) || null;
const int = (fd: FormData, key: string) => Number.parseInt(text(fd, key), 10);

const IMAGE_LABELS: Record<string, string> = {
  logo: "Le logo",
  strip: "La photo de la carte",
  tier: "La photo du niveau",
  stamp: "L'icône de tampon",
  "stamp-empty": "L'icône de tampon vide",
};

/** Envoie une image (logo, décor, icône) dans Supabase Storage et renvoie son adresse publique. */
async function uploadImage(file: File, businessId: string, kind: keyof typeof IMAGE_LABELS): Promise<string> {
  const types: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const ext = types[file.type];
  const label = IMAGE_LABELS[kind];
  if (!ext) throw new Error(`${label} doit être une image PNG, JPG ou WEBP.`);
  if (file.size > 3 * 1024 * 1024) throw new Error(`${label} doit faire moins de 3 Mo.`);

  const supabase = createAdminClient();
  const path = `${businessId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(`Envoi de l'image impossible : ${error.message}`);
  return supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
}

const fileOf = (fd: FormData, key: string): File | null => {
  const f = fd.get(key);
  return f instanceof File && f.size > 0 ? f : null;
};
const num = (fd: FormData, key: string) => Number.parseFloat(text(fd, key).replace(",", "."));

type TierInput = {
  id?: string;
  key?: string;
  name: string;
  min_value: number;
  perk: string | null;
  color: string | null;
  remove_image?: boolean;
};
type CatalogInput = { id?: string; name: string; cost: number };

function parseJsonList<T>(raw: string): T[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Remplace la liste (niveaux ou cadeaux) en gardant les lignes existantes (pour ne pas perdre l'historique). */
async function syncList(
  table: "program_tiers" | "reward_catalog",
  programId: string,
  rows: Record<string, unknown>[],
) {
  const supabase = createAdminClient();
  const { data: existing } = await supabase.from(table).select("id").eq("program_id", programId);
  const keep = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
  const toDelete = (existing ?? []).map((r: { id: string }) => r.id).filter((id) => !keep.has(id));
  if (toDelete.length > 0) await supabase.from(table).delete().in("id", toDelete);
  for (const [i, row] of rows.entries()) {
    const { id, ...fields } = row;
    const values = { ...fields, sort: i, program_id: programId };
    if (id && (existing ?? []).some((e: { id: string }) => e.id === id)) {
      const { error } = await supabase.from(table).update(values).eq("id", id as string);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from(table).insert(values);
      if (error) throw new Error(error.message);
    }
  }
}

/** Choisit une adresse unique : boulangerie-du-bourg, puis boulangerie-du-bourg-2… */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "commerce";
  const supabase = createAdminClient();
  const { data } = await supabase.from("businesses").select("slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Remet à jour dans les Wallet toutes les cartes d'un programme (après un changement de design). */
async function resyncProgram(program: Program, business: Business) {
  const supabase = createAdminClient();
  if (isGoogleConfigured()) {
    try {
      await upsertGoogleClass(program, business);
    } catch (err) {
      console.error("[resync google class]", (err as Error).message);
    }
  }
  const { data } = await supabase
    .from("cards")
    .update({ updated_at: new Date().toISOString() })
    .eq("program_id", program.id)
    .select("id");
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    await syncCards(await loadCardBundlesByIds(ids.slice(i, i + 200)));
  }
}

/** Crée ou modifie une entreprise et sa carte (formulaire du tableau de bord). */
export async function saveBusiness(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const supabase = createAdminClient();

  const businessId = text(fd, "business_id");
  const name = text(fd, "name");
  const programName = text(fd, "program_name");
  const mode = text(fd, "mode") as Program["mode"];
  const reward = text(fd, "reward_description");
  const threshold = int(fd, "reward_threshold");
  const maxStamps = int(fd, "max_stamps_per_day");
  const maxNotifs = int(fd, "max_notifications_per_week");
  const pointsPerEuro = num(fd, "points_per_euro");
  const cashbackPercent = num(fd, "cashback_percent");
  const maxPurchase = num(fd, "max_purchase_amount");
  const overlay = int(fd, "strip_overlay");
  const tiersEnabled = fd.get("tiers_enabled") === "on";
  const tierBasis = text(fd, "tier_basis") === "spend" ? "spend" : "visits";
  const colors = {
    background_color: text(fd, "background_color"),
    foreground_color: text(fd, "foreground_color"),
    label_color: text(fd, "label_color"),
    stamp_color: text(fd, "stamp_color") || "#FFFFFF",
  };

  const tierInputs = parseJsonList<TierInput>(text(fd, "tiers_json"));
  const tiers: Record<string, unknown>[] = tierInputs
    .map((t) => ({
      id: t.id,
      key: String(t.key ?? ""),
      remove_image: !!t.remove_image,
      name: String(t.name ?? "").trim().slice(0, 30),
      min_value: Number(t.min_value) || 0,
      perk: String(t.perk ?? "").trim().slice(0, 120) || null,
      color: t.color && isHexColor(t.color) ? t.color : null,
    }))
    .filter((t) => t.name);
  const catalog = parseJsonList<CatalogInput>(text(fd, "catalog_json"))
    .map((r) => ({ id: r.id, name: String(r.name ?? "").trim().slice(0, 60), cost: Math.round(Number(r.cost)) }))
    .filter((r) => r.name && r.cost > 0);

  if (!name) return { error: "Indique le nom de l'entreprise." };
  if (!programName) return { error: "Indique le nom de la carte." };
  if (!["stamps", "points", "cashback"].includes(mode)) return { error: "Choisis un mode de récompense." };
  if (mode === "stamps" && !reward) return { error: "Indique le cadeau obtenu avec les tampons." };
  if (mode === "stamps" && !(threshold >= 2 && threshold <= 50)) return { error: "Le nombre de tampons doit être entre 2 et 50." };
  if (mode === "points" && !(pointsPerEuro > 0 && pointsPerEuro <= 100)) return { error: "Points par euro : entre 0,1 et 100." };
  if (mode === "points" && catalog.length === 0) return { error: "Ajoute au moins un cadeau au catalogue (ex : 100 points = 1 café)." };
  if (mode === "cashback" && !(cashbackPercent > 0 && cashbackPercent <= 50)) return { error: "Cashback : entre 0,1 % et 50 %." };
  if (mode !== "stamps" && !(maxPurchase >= 1 && maxPurchase <= 100000)) return { error: "Montant maximum d'un achat : entre 1 et 100 000 €." };
  if (!(maxStamps >= 1 && maxStamps <= 10)) return { error: "Passages par jour : entre 1 et 10." };
  if (!(maxNotifs >= 0 && maxNotifs <= 7)) return { error: "Notifications par semaine : entre 0 et 7." };
  if (!(overlay >= 0 && overlay <= 80)) return { error: "Voile sur le décor : entre 0 et 80 %." };
  if (!Object.values(colors).every(isHexColor)) return { error: "Une couleur n'est pas valide." };
  if (tiersEnabled && tiers.length === 0) return { error: "Ajoute au moins un niveau, ou désactive les niveaux." };

  // Design avancé et boosters
  const pick = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  const clampInt = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  const slug = (value: string) => value.replace(/[^a-z]/g, "");
  const fillColor = text(fd, "fill_color");
  const multiplier = clampInt(int(fd, "bonus_multiplier"), 1, 3, 1);
  const startHour = int(fd, "bonus_start_hour");
  const endHour = int(fd, "bonus_end_hour");
  if (multiplier > 1 && !(startHour >= 0 && startHour <= 23 && endHour >= 1 && endHour <= 24 && endHour > startHour)) {
    return { error: "Heures creuses : l'heure de fin doit être après l'heure de début." };
  }
  const safeUrl = (key: string) => {
    const value = text(fd, key);
    if (!value) return null;
    try {
      const u = new URL(value);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const coord = (key: string, limit: number) => {
    const value = num(fd, key);
    return Number.isFinite(value) && Math.abs(value) <= limit ? Math.round(value * 1e6) / 1e6 : null;
  };
  const latitude = coord("latitude", 90);
  const longitude = coord("longitude", 180);
  const label = (key: string) => text(fd, key).slice(0, 16) || null;
  const signupBonus = clampInt(int(fd, "signup_bonus"), 0, 1000, 0);

  const businessFields = {
    name,
    address: optional(fd, "address"),
    phone: optional(fd, "phone"),
    email: optional(fd, "email"),
    max_notifications_per_week: maxNotifs,
    latitude: latitude !== null && longitude !== null ? latitude : null,
    longitude: latitude !== null && longitude !== null ? longitude : null,
    relevant_text: text(fd, "relevant_text").slice(0, 80) || null,
    google_review_url: safeUrl("google_review_url"),
    instagram_url: safeUrl("instagram_url"),
  };
  const programFields: Record<string, unknown> = {
    name: programName,
    mode,
    reward_description: reward || (mode === "points" ? "Cadeaux du catalogue" : "Cagnotte cashback"),
    reward_threshold: threshold >= 2 && threshold <= 50 ? threshold : 10,
    points_per_euro: pointsPerEuro > 0 ? pointsPerEuro : 1,
    cashback_percent: cashbackPercent > 0 ? cashbackPercent : 5,
    max_purchase_amount: maxPurchase >= 1 ? maxPurchase : 1000,
    max_stamps_per_day: maxStamps,
    back_text: optional(fd, "back_text"),
    strip_overlay: overlay,
    tiers_enabled: tiersEnabled,
    tier_basis: tierBasis,
    welcome_offer: optional(fd, "welcome_offer"),
    birthday_offer: optional(fd, "birthday_offer"),
    ...colors,
    decor_preset: slug(text(fd, "decor_preset")) || "none",
    progress_style: pick(text(fd, "progress_style"), ["glass", "minimal", "track", "grid", "collection", "fill", "none"] as const, "glass"),
    photo_focus: pick(text(fd, "photo_focus"), ["top", "center", "bottom"] as const, "center"),
    stamps_position: pick(text(fd, "stamps_position"), ["center", "right", "bottom"] as const, "bottom"),
    icon_preset: slug(text(fd, "icon_preset")) || "check",
    collection_icons: text(fd, "collection_icons").split(",").map(slug).filter(Boolean).slice(0, 10),
    vessel: pick(text(fd, "vessel"), ["glass", "cup"] as const, "glass"),
    fill_color: isHexColor(fillColor) ? fillColor : "#8FD16A",
    reward_on_last: fd.get("reward_on_last") === "on",
    show_logo_text: fd.get("show_logo_text") === "on",
    label_balance: label("label_balance"),
    label_customer: label("label_customer"),
    label_reward: label("label_reward"),
    // En mode tampons, le bonus d'inscription ne peut pas offrir le cadeau directement
    signup_bonus: mode === "stamps" ? Math.min(signupBonus, Math.max(0, (threshold || 10) - 1)) : mode === "points" ? signupBonus : 0,
    bonus_multiplier: multiplier,
    bonus_start_hour: multiplier > 1 ? startHour : null,
    bonus_end_hour: multiplier > 1 ? endHour : null,
    referral_bonus: clampInt(int(fd, "referral_bonus"), 0, 1000, 0),
    streak_enabled: fd.get("streak_enabled") === "on",
    streak_goal: clampInt(int(fd, "streak_goal"), 2, 52, 4),
    streak_bonus: clampInt(int(fd, "streak_bonus"), 0, 1000, 1),
    streak_reminder_dow: clampInt(int(fd, "streak_reminder_dow"), 0, 6, 0),
    streak_reminder_hour: clampInt(int(fd, "streak_reminder_hour"), 0, 23, 11),
    lap_times_enabled: fd.get("lap_times_enabled") === "on",
  };
  if (fd.get("remove_strip_image") === "on") programFields.strip_image_url = null;
  if (fd.get("remove_stamp_icon") === "on") programFields.stamp_icon_url = null;
  if (fd.get("remove_stamp_empty_icon") === "on") programFields.stamp_empty_icon_url = null;

  const logo = fileOf(fd, "logo");
  const strip = fileOf(fd, "strip_image");
  const stampIcon = fileOf(fd, "stamp_icon");
  const stampEmpty = fileOf(fd, "stamp_empty_icon");

  let createdId: string | null = null;
  try {
    let business: Business;
    if (!businessId) {
      const { data, error } = await supabase
        .from("businesses")
        .insert({ ...businessFields, slug: await uniqueSlug(name) })
        .select("*")
        .single();
      if (error || !data) return { error: `Création impossible : ${error?.message}` };
      business = data as Business;
      createdId = business.id;
    } else {
      const { data, error } = await supabase.from("businesses").update(businessFields).eq("id", businessId).select("*").single();
      if (error || !data) return { error: `Modification impossible : ${error?.message}` };
      business = data as Business;
    }

    // Images envoyées
    if (logo) {
      const logo_url = await uploadImage(logo, business.id, "logo");
      await supabase.from("businesses").update({ logo_url }).eq("id", business.id);
      business.logo_url = logo_url;
    }
    if (strip) programFields.strip_image_url = await uploadImage(strip, business.id, "strip");
    if (stampIcon) programFields.stamp_icon_url = await uploadImage(stampIcon, business.id, "stamp");
    if (stampEmpty) programFields.stamp_empty_icon_url = await uploadImage(stampEmpty, business.id, "stamp-empty");

    const { data: programData, error: progError } = businessId
      ? await supabase.from("loyalty_programs").update(programFields).eq("business_id", business.id).select("*").single()
      : await supabase.from("loyalty_programs").insert({ ...programFields, business_id: business.id }).select("*").single();
    if (progError || !programData) return { error: `Carte non enregistrée : ${progError?.message}` };
    const program = programData as Program;

    // Photo propre à chaque niveau (facultative)
    const tierRows: Record<string, unknown>[] = [];
    for (const t of tiers) {
      const { key, remove_image, ...row } = t as Record<string, unknown> & { key: string; remove_image: boolean };
      const file = key ? fileOf(fd, `tier_image_${key}`) : null;
      if (file) row.image_url = await uploadImage(file, business.id, "tier");
      else if (remove_image) row.image_url = null;
      tierRows.push(row);
    }
    await syncList("program_tiers", program.id, tierRows);
    await syncList("reward_catalog", program.id, catalog);
    await supabase.rpc("refresh_program_tiers", { p_program_id: program.id });

    if (businessId) {
      // Les cartes déjà dans les téléphones se mettent à jour en arrière-plan
      after(() => resyncProgram(program, business));
      revalidatePath(`/admin/entreprises/${businessId}`);
    }
  } catch (err) {
    return { error: (err as Error).message };
  }

  if (createdId) {
    revalidatePath("/admin");
    redirect(`/admin/entreprises/${createdId}?cree=1`);
  }
  return { ok: "Enregistré. Les cartes des clients se mettent à jour dans quelques instants." };
}

/** Offre ponctuelle : ajoute un coupon sur la carte de tous les clients (et prévient ceux qui acceptent les offres). */
export async function sendOfferToAll(
  businessId: string,
  payload: { title: string; days: number | null; notify: boolean },
): Promise<{ ok: boolean; error?: string; count?: number }> {
  await requireAdmin();
  const title = payload.title.trim().slice(0, 120);
  if (!title) return { ok: false, error: "Écris l'offre (ex : -20 % sur tout ce week-end)." };
  const supabase = createAdminClient();
  const { data: program } = await supabase.from("loyalty_programs").select("id").eq("business_id", businessId).single();
  if (!program) return { ok: false, error: "Carte introuvable." };
  const { data: cards } = await supabase.from("cards").select("id").eq("program_id", program.id);
  const ids = (cards ?? []).map((c: { id: string }) => c.id);
  if (ids.length === 0) return { ok: false, error: "Aucun client pour le moment." };
  const expires = payload.days && payload.days > 0 ? new Date(Date.now() + payload.days * 86400000).toISOString() : null;
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const { error } = await supabase
      .from("coupons")
      .insert(slice.map((card_id) => ({ card_id, program_id: program.id, title, kind: "manual", expires_at: expires })));
    if (error) return { ok: false, error: error.message };
    await supabase.from("cards").update({ updated_at: new Date().toISOString() }).in("id", slice);
  }
  if (payload.notify) {
    const res = await createNotification({
      businessId,
      message: `🎁 Nouvelle offre sur ta carte : ${title}`.slice(0, 180),
      sendAt: new Date(),
      repeatEveryDays: null,
      repeatUntil: null,
      createdBy: "admin",
    });
    if (!res.ok) {
      revalidatePath(`/admin/entreprises/${businessId}`);
      return { ok: true, count: ids.length, error: `Offre ajoutée, mais notification non envoyée : ${res.error}` };
    }
  } else {
    after(async () => {
      for (let i = 0; i < ids.length; i += 200) await syncCards(await loadCardBundlesByIds(ids.slice(i, i + 200)));
    });
  }
  revalidatePath(`/admin/entreprises/${businessId}`);
  return { ok: true, count: ids.length };
}

export async function setBusinessStatus(businessId: string, status: "active" | "suspended") {
  const { supabase } = await requireAdmin();
  await supabase.from("businesses").update({ status }).eq("id", businessId);
  revalidatePath(`/admin/entreprises/${businessId}`);
  revalidatePath("/admin");
}

export async function setProgramActive(businessId: string, isActive: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.from("loyalty_programs").update({ is_active: isActive }).eq("business_id", businessId);
  revalidatePath(`/admin/entreprises/${businessId}`);
}

/** Crée un accès commerçant (lien + PIN). Le PIN est chiffré : on ne pourra plus le relire. */
export async function createAccess(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const businessId = text(fd, "business_id");
  const pin = text(fd, "pin");
  const label = text(fd, "label") || "Accès principal";
  if (!/^\d{4,8}$/.test(pin)) return { error: "Le PIN doit contenir entre 4 et 8 chiffres." };

  const { error } = await supabase.rpc("create_scanner_access", {
    p_business_id: businessId,
    p_pin: pin,
    p_label: label,
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/entreprises/${businessId}`);
  return {
    ok: `Accès « ${label} » créé. Note bien le PIN ${pin} et donne-le au commerçant : il ne sera plus affiché.`,
  };
}

export async function updateAccess(
  businessId: string,
  accessId: string,
  change: { is_active?: boolean; can_send_notifications?: boolean; failed_attempts?: 0 },
) {
  const { supabase } = await requireAdmin();
  await supabase.from("scanner_access").update(change).eq("id", accessId).eq("business_id", businessId);
  revalidatePath(`/admin/entreprises/${businessId}`);
}

export async function deleteAccess(businessId: string, accessId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("scanner_access").delete().eq("id", accessId).eq("business_id", businessId);
  revalidatePath(`/admin/entreprises/${businessId}`);
}

export type NotificationPayload = {
  message: string;
  when: "now" | "later";
  sendAt?: string; // valeur d'un champ datetime-local, heure de Guadeloupe
  repeatEveryDays?: number | null;
  repeatUntil?: string | null;
};

/** Notification envoyée par toi depuis le tableau de bord. */
export async function adminCreateNotification(businessId: string, payload: NotificationPayload) {
  await requireAdmin();
  const sendAt = payload.when === "now" ? new Date() : guadeloupeLocalToDate(payload.sendAt ?? "");
  if (!sendAt) return { ok: false as const, error: "Choisis une date et une heure." };
  const result = await createNotification({
    businessId,
    message: payload.message,
    sendAt,
    repeatEveryDays: payload.repeatEveryDays ?? null,
    repeatUntil: payload.repeatUntil ? guadeloupeLocalToDate(payload.repeatUntil) : null,
    createdBy: "admin",
  });
  revalidatePath(`/admin/entreprises/${businessId}`);
  return result;
}

export async function adminCancelNotification(businessId: string, notificationId: string) {
  const { supabase } = await requireAdmin();
  await supabase
    .from("notifications")
    .update({ status: "cancelled" })
    .eq("id", notificationId)
    .eq("business_id", businessId)
    .eq("status", "scheduled");
  revalidatePath(`/admin/entreprises/${businessId}`);
}

/** Droit à l'effacement (RGPD) : supprime le client, sa carte, son historique. */
export async function deleteCustomer(businessId: string, customerId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("customers").delete().eq("id", customerId).eq("business_id", businessId);
  revalidatePath(`/admin/entreprises/${businessId}`);
}
