import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardBundle } from "@/lib/types";

/**
 * « Fiche éclair » de l'espace commerçant (walty.fr/espace) : ce qu'il faut savoir en 1 seconde après un scan.
 * Calculé côté serveur à partir des passages (stamp_events non annulés) et de la fiche du client,
 * en heure de Guadeloupe (America/Guadeloupe = UTC-4 toute l'année, sans heure d'été).
 *
 * state :
 * - « first »  : aucun passage avant aujourd'hui, ni aujourd'hui (nouvelle carte) → vert « Première visite »
 * - « back »   : pas encore venu aujourd'hui → vert « Dernière visite il y a 12 jours »
 * - « today »  : déjà venu aujourd'hui, limite pas atteinte → orange « Déjà passé aujourd'hui à 10 h 12 »
 * - « limit »  : limite de passages du jour atteinte → rouge « Limite du jour atteinte »
 * Aucun numéro de carte n'est renvoyé.
 */
export type VisitInfo = {
  state: "first" | "back" | "today" | "limit";
  /** Dernier passage AVANT aujourd'hui (null si aucun). */
  last_visit_at: string | null;
  /** Jours (calendrier de Guadeloupe) depuis ce dernier passage. */
  days_since: number | null;
  today_count: number;
  today_first_at: string | null;
  today_last_at: string | null;
  max_per_day: number;
  limit_reached: boolean;
  /** Passages (tampons ou achats) non annulés depuis l'inscription. */
  visits_total: number;
  customer_since: string;
  /** Dernier cadeau remis (non annulé). */
  last_reward_at: string | null;
  program_active: boolean;
  /** Un tampon serait accepté maintenant (mode tampons, programme actif, cadeau pas débloqué, limite pas atteinte). */
  can_stamp: boolean;
};

const GP_OFFSET_MS = 4 * 3600 * 1000;
const DAY_MS = 86400000;
const VISIT_TYPES = ["stamp", "purchase"];
/** "2026-10-20" : le jour en heure de Guadeloupe. */
const gpDay = (t: number) => new Date(t - GP_OFFSET_MS).toISOString().slice(0, 10);

export async function visitInfo(bundle: CardBundle, now = Date.now()): Promise<VisitInfo> {
  const { card, customer, program } = bundle;
  const supabase = createAdminClient();
  const dayStart = new Date(Date.parse(`${gpDay(now)}T00:00:00-04:00`)).toISOString();
  const visits = () =>
    supabase
      .from("stamp_events")
      .select("created_at")
      .eq("card_id", card.id)
      .eq("business_id", program.business_id)
      .in("event_type", VISIT_TYPES)
      .is("undone_at", null);

  const [today, before, total, reward] = await Promise.all([
    visits().gte("created_at", dayStart).order("created_at", { ascending: true }).limit(100),
    visits().lt("created_at", dayStart).order("created_at", { ascending: false }).limit(1),
    supabase
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("card_id", card.id)
      .eq("business_id", program.business_id)
      .in("event_type", VISIT_TYPES)
      .is("undone_at", null),
    supabase
      .from("stamp_events")
      .select("created_at")
      .eq("card_id", card.id)
      .eq("business_id", program.business_id)
      .in("event_type", ["reward_redeemed", "points_redeemed"])
      .is("undone_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  for (const r of [today, before, total, reward]) if (r.error) throw new Error(r.error.message);

  const todayRows = (today.data ?? []) as { created_at: string }[];
  const last = ((before.data ?? []) as { created_at: string }[])[0]?.created_at ?? null;
  const max = Number(program.max_stamps_per_day ?? 0);
  const todayCount = todayRows.length;
  const limitReached = max > 0 && todayCount >= max;
  const rewardReady = program.mode === "stamps" && card.stamps_count >= program.reward_threshold;
  const daysSince = last ? Math.round((Date.parse(gpDay(now)) - Date.parse(gpDay(Date.parse(last)))) / DAY_MS) : null;

  return {
    state: limitReached ? "limit" : todayCount > 0 ? "today" : last ? "back" : "first",
    last_visit_at: last,
    days_since: daysSince,
    today_count: todayCount,
    today_first_at: todayRows[0]?.created_at ?? null,
    today_last_at: todayRows[todayCount - 1]?.created_at ?? null,
    max_per_day: max,
    limit_reached: limitReached,
    visits_total: total.count ?? 0,
    customer_since: customer.created_at,
    last_reward_at: ((reward.data ?? []) as { created_at: string }[])[0]?.created_at ?? null,
    program_active: program.is_active !== false,
    can_stamp: program.mode === "stamps" && program.is_active !== false && !rewardReady && !limitReached,
  };
}
