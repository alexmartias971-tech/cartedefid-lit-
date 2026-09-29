import "server-only";
import { loadCardBundlesByIds } from "@/lib/cards";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, NotificationRow } from "@/lib/types";
import { syncCards } from "@/lib/wallet-sync";

const DAY = 24 * 3600 * 1000;
const GP_OFFSET = 4 * 3600 * 1000; // la Guadeloupe est à UTC-4 toute l'année

/** Début (lundi 00:00, heure de Guadeloupe) et fin de la semaine qui contient cette date. */
export function weekBounds(date: Date): { start: Date; end: Date } {
  const local = new Date(date.getTime() - GP_OFFSET);
  const dayFromMonday = (local.getUTCDay() + 6) % 7;
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dayFromMonday);
  const start = new Date(startLocal + GP_OFFSET);
  return { start, end: new Date(start.getTime() + 7 * DAY) };
}

/** Nombre de notifications prévues ou envoyées pour cette entreprise dans la semaine de "date". */
async function countInWeek(businessId: string, date: Date, excludeId?: string): Promise<number> {
  const supabase = createAdminClient();
  const { start, end } = weekBounds(date);
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .in("status", ["scheduled", "sending", "sent"])
    .gte("send_at", start.toISOString())
    .lt("send_at", end.toISOString());
  if (excludeId) query = query.neq("id", excludeId);
  const { count } = await query;
  return count ?? 0;
}

export type CreateNotificationInput = {
  businessId: string;
  message: string;
  sendAt: Date;
  repeatEveryDays: number | null;
  repeatUntil: Date | null;
  createdBy: "admin" | "merchant";
};

/** Crée une notification (immédiate ou programmée) en respectant la limite par semaine. */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ ok: true; id: string; sentNow: boolean } | { ok: false; error: string }> {
  const message = input.message.trim();
  if (message.length === 0) return { ok: false, error: "Écris un message." };
  if (message.length > 180) return { ok: false, error: "Le message doit faire 180 caractères maximum." };
  if (input.repeatEveryDays !== null && input.repeatEveryDays < 3) {
    return { ok: false, error: "La répétition doit être d'au moins 3 jours (sinon les clients suppriment la carte)." };
  }

  const now = Date.now();
  const sendAt = input.sendAt.getTime() < now ? new Date(now) : input.sendAt;
  if (sendAt.getTime() > now + 90 * DAY) return { ok: false, error: "Tu ne peux pas programmer à plus de 90 jours." };

  const supabase = createAdminClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, status, max_notifications_per_week")
    .eq("id", input.businessId)
    .single();
  if (!business || business.status !== "active") return { ok: false, error: "Ce compte est suspendu." };

  const used = await countInWeek(input.businessId, sendAt);
  if (used >= business.max_notifications_per_week) {
    return {
      ok: false,
      error: `Limite atteinte : ${business.max_notifications_per_week} notification(s) par semaine (du lundi au dimanche). Choisis une autre semaine.`,
    };
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      business_id: input.businessId,
      message,
      send_at: sendAt.toISOString(),
      repeat_every_days: input.repeatEveryDays,
      repeat_until: input.repeatUntil?.toISOString() ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Impossible d'enregistrer la notification." };

  const sentNow = sendAt.getTime() <= now + 60 * 1000;
  if (sentNow) await sendNotification(data.id);
  return { ok: true, id: data.id, sentNow };
}

/** Programme la prochaine répétition d'une notification. */
async function scheduleNextOccurrence(n: NotificationRow) {
  if (!n.repeat_every_days) return;
  const next = new Date(new Date(n.send_at).getTime() + n.repeat_every_days * DAY);
  if (n.repeat_until && next > new Date(n.repeat_until)) return;
  const supabase = createAdminClient();
  await supabase.from("notifications").insert({
    business_id: n.business_id,
    message: n.message,
    send_at: next.toISOString(),
    repeat_every_days: n.repeat_every_days,
    repeat_until: n.repeat_until,
    created_by: n.created_by,
  });
}

/** Envoie une notification à tous les clients de l'entreprise qui ont accepté les offres. */
export async function sendNotification(id: string): Promise<void> {
  const supabase = createAdminClient();

  // On "réserve" la notification pour ne jamais l'envoyer deux fois
  const { data: claimed } = await supabase
    .from("notifications")
    .update({ status: "sending" })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("*")
    .maybeSingle();
  if (!claimed) return;
  const n = claimed as NotificationRow;

  try {
    const { data: businessData } = await supabase.from("businesses").select("*").eq("id", n.business_id).single();
    const business = businessData as Business | null;
    if (!business || business.status !== "active") {
      await supabase.from("notifications").update({ status: "failed", error: "Compte suspendu" }).eq("id", id);
      return;
    }

    // Les répétitions sont aussi soumises à la limite par semaine
    if (n.repeat_every_days) {
      const others = await countInWeek(n.business_id, new Date(n.send_at), n.id);
      if (others >= business.max_notifications_per_week) {
        await supabase
          .from("notifications")
          .update({ status: "skipped", error: "Limite par semaine atteinte" })
          .eq("id", id);
        await scheduleNextOccurrence(n);
        return;
      }
    }

    // Les cartes des clients qui ont accepté les offres
    const cardIds: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("cards")
        .select("id, customers!inner(business_id, marketing_optin)")
        .eq("customers.business_id", n.business_id)
        .eq("customers.marketing_optin", true)
        .range(from, from + 999);
      const rows = (data ?? []) as { id: string }[];
      cardIds.push(...rows.map((r) => r.id));
      if (rows.length < 1000) break;
    }

    // On écrit le message sur chaque carte, puis on prévient les téléphones
    for (let i = 0; i < cardIds.length; i += 200) {
      const slice = cardIds.slice(i, i + 200);
      await supabase.from("cards").update({ last_message: n.message }).in("id", slice);
      const bundles = await loadCardBundlesByIds(slice);
      await syncCards(bundles, { header: business.name, body: n.message });
    }

    await supabase
      .from("notifications")
      .update({ status: "sent", sent_at: new Date().toISOString(), recipients_count: cardIds.length })
      .eq("id", id);
    await scheduleNextOccurrence(n);
  } catch (err) {
    console.error("[sendNotification]", err);
    await supabase
      .from("notifications")
      .update({ status: "failed", error: (err as Error).message.slice(0, 500) })
      .eq("id", id);
  }
}

/** Appelé toutes les 5 minutes par la tâche planifiée : envoie ce qui est prévu. */
export async function runDueNotifications(): Promise<number> {
  const supabase = createAdminClient();

  // Débloque les envois restés coincés (coupure pendant un envoi)
  await supabase
    .from("notifications")
    .update({ status: "failed", error: "Envoi interrompu" })
    .eq("status", "sending")
    .lt("send_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("status", "scheduled")
    .lte("send_at", new Date().toISOString())
    .order("send_at")
    .limit(20);
  for (const row of data ?? []) await sendNotification(row.id);
  return data?.length ?? 0;
}

/** Message automatique "Tu nous manques" aux clients absents depuis 30 jours (une seule fois). */
export async function runWinback(): Promise<number> {
  const supabase = createAdminClient();
  const now = Date.now();
  const { data } = await supabase
    .from("cards")
    .select(
      "id, stamps_count, customers!inner(first_name, last_visit_at, marketing_optin), loyalty_programs!inner(reward_threshold, is_active, businesses!inner(name, status))",
    )
    .is("winback_sent_at", null)
    .eq("customers.marketing_optin", true)
    .lt("customers.last_visit_at", new Date(now - 30 * DAY).toISOString())
    .gt("customers.last_visit_at", new Date(now - 60 * DAY).toISOString())
    .eq("loyalty_programs.is_active", true)
    .eq("loyalty_programs.businesses.status", "active")
    .limit(100);

  type Row = {
    id: string;
    stamps_count: number;
    customers: { first_name: string };
    loyalty_programs: { reward_threshold: number; businesses: { name: string } };
  };
  const rows = (data ?? []) as unknown as Row[];

  for (const row of rows) {
    const name = row.loyalty_programs.businesses.name;
    const message = `${row.customers.first_name}, tu nous manques ! Ta carte ${name} t'attend : ${row.stamps_count}/${row.loyalty_programs.reward_threshold} tampons.`;
    await supabase
      .from("cards")
      .update({ last_message: message, winback_sent_at: new Date().toISOString() })
      .eq("id", row.id);
    const bundles = await loadCardBundlesByIds([row.id]);
    await syncCards(bundles, { header: name, body: message });
  }
  return rows.length;
}

/** Offre d'anniversaire : ajoutée sur la carte le jour J (valable 30 jours), avec notification si le client accepte. */
export async function runBirthdays(): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("birthday_cards_today");
  if (error) {
    console.error("[runBirthdays]", error.message);
    return 0;
  }
  type Row = {
    card_id: string;
    program_id: string;
    offer: string;
    first_name: string;
    business_name: string;
    marketing_optin: boolean;
  };
  let count = 0;
  for (const row of (data ?? []) as Row[]) {
    const { error: insertError } = await supabase.from("coupons").insert({
      card_id: row.card_id,
      program_id: row.program_id,
      title: row.offer,
      kind: "birthday",
      expires_at: new Date(Date.now() + 30 * DAY).toISOString(),
    });
    if (insertError) continue; // déjà offerte cette année
    count++;
    const message = `🎂 Joyeux anniversaire ${row.first_name} ! ${row.business_name} t'offre : ${row.offer}`.slice(0, 180);
    await supabase
      .from("cards")
      .update(row.marketing_optin ? { last_message: message } : { updated_at: new Date().toISOString() })
      .eq("id", row.card_id);
    const bundles = await loadCardBundlesByIds([row.card_id]);
    await syncCards(bundles, row.marketing_optin ? { header: row.business_name, body: message } : undefined);
  }
  return count;
}

/**
 * Rappel de série : le jour choisi (ex : dimanche 11 h), les clients qui ont une série en cours
 * mais ne sont pas encore venus cette semaine reçoivent « Ta série s'arrête ce soir ! ».
 * Un seul rappel par semaine et par client, seulement s'il accepte les offres.
 */
export async function runStreakReminders(): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("streak_cards_to_remind");
  if (error) {
    console.error("[runStreakReminders]", error.message);
    return 0;
  }
  type Row = { card_id: string; first_name: string; business_name: string; streak: number };
  const rows = (data ?? []) as Row[];
  const local = new Date(Date.now() - GP_OFFSET);
  const dow = (local.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow)).toISOString().slice(0, 10);
  for (const row of rows) {
    const message = `🔥 ${row.first_name}, ta série de ${row.streak} semaine${row.streak > 1 ? "s" : ""} s'arrête ce soir ! Passe nous voir pour la garder.`.slice(0, 180);
    await supabase.from("cards").update({ last_message: message, streak_reminded_week: monday }).eq("id", row.card_id);
    const bundles = await loadCardBundlesByIds([row.card_id]);
    await syncCards(bundles, { header: row.business_name, body: message });
  }
  return rows.length;
}
