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

/** Envoie le logo dans Supabase Storage et renvoie son adresse publique. */
async function uploadLogo(file: File, businessId: string): Promise<string> {
  const types: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const ext = types[file.type];
  if (!ext) throw new Error("Le logo doit être une image PNG, JPG ou WEBP.");
  if (file.size > 3 * 1024 * 1024) throw new Error("Le logo doit faire moins de 3 Mo.");

  const supabase = createAdminClient();
  const path = `${businessId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(`Envoi du logo impossible : ${error.message}`);
  return supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
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
  const reward = text(fd, "reward_description");
  const threshold = int(fd, "reward_threshold");
  const maxStamps = int(fd, "max_stamps_per_day");
  const maxNotifs = int(fd, "max_notifications_per_week");
  const colors = {
    background_color: text(fd, "background_color"),
    foreground_color: text(fd, "foreground_color"),
    label_color: text(fd, "label_color"),
  };

  if (!name) return { error: "Indique le nom de l'entreprise." };
  if (!programName) return { error: "Indique le nom de la carte." };
  if (!reward) return { error: "Indique le cadeau." };
  if (!(threshold >= 2 && threshold <= 50)) return { error: "Le nombre de tampons doit être entre 2 et 50." };
  if (!(maxStamps >= 1 && maxStamps <= 10)) return { error: "Tampons par jour : entre 1 et 10." };
  if (!(maxNotifs >= 0 && maxNotifs <= 7)) return { error: "Notifications par semaine : entre 0 et 7." };
  if (!Object.values(colors).every(isHexColor)) return { error: "Une couleur n'est pas valide." };

  const businessFields = {
    name,
    address: optional(fd, "address"),
    phone: optional(fd, "phone"),
    email: optional(fd, "email"),
    max_notifications_per_week: maxNotifs,
  };
  const programFields = {
    name: programName,
    reward_description: reward,
    reward_threshold: threshold,
    max_stamps_per_day: maxStamps,
    back_text: optional(fd, "back_text"),
    ...colors,
  };
  const logo = fd.get("logo");
  const hasLogo = logo instanceof File && logo.size > 0;

  let createdId: string | null = null;
  try {
    if (!businessId) {
      // --- Création ---
      const { data: business, error } = await supabase
        .from("businesses")
        .insert({ ...businessFields, slug: await uniqueSlug(name) })
        .select("*")
        .single();
      if (error || !business) return { error: `Création impossible : ${error?.message}` };

      if (hasLogo) {
        const logo_url = await uploadLogo(logo, business.id);
        await supabase.from("businesses").update({ logo_url }).eq("id", business.id);
      }
      const { error: progError } = await supabase
        .from("loyalty_programs")
        .insert({ ...programFields, business_id: business.id });
      if (progError) return { error: `Carte non créée : ${progError.message}` };

      createdId = business.id;
    } else {
      // --- Modification ---
      const update: Record<string, unknown> = { ...businessFields };
      if (hasLogo) update.logo_url = await uploadLogo(logo, businessId);
      const { data: business, error } = await supabase
        .from("businesses")
        .update(update)
        .eq("id", businessId)
        .select("*")
        .single();
      if (error || !business) return { error: `Modification impossible : ${error?.message}` };

      const { data: program, error: progError } = await supabase
        .from("loyalty_programs")
        .update(programFields)
        .eq("business_id", businessId)
        .select("*")
        .single();
      if (progError || !program) return { error: `Carte non modifiée : ${progError?.message}` };

      // Les cartes déjà dans les téléphones se mettent à jour en arrière-plan
      after(() => resyncProgram(program as Program, business as Business));
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
