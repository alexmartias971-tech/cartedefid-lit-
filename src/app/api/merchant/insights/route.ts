import { getMerchantSession } from "@/lib/merchant-session";
import { DAY_MS, expired, fetchAll, GP_OFFSET_MS, json, REWARD_TYPES, VISIT_TYPES } from "@/lib/merchant-space";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEssentiel, planRefused } from "@/lib/walty-plan";
import { getMerchantRole } from "@/lib/merchant-role";

/** Début (heure de Guadeloupe) du mois, `back` mois en arrière. */
function monthStart(back: number) {
  const now = new Date(Date.now() - GP_OFFSET_MS);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1) + GP_OFFSET_MS);
}

/**
 * Chiffres détaillés pour l'espace commerçant de walty.fr (en plus de « stats ») :
 * jours et heures d'affluence, 6 derniers mois, fidélité (clients revenus, endormis), téléphones utilisés.
 * Seulement des totaux : aucune donnée personnelle. Formule Essentiel : 403 (Tout compris seulement).
 */
export async function GET() {
  const session = await getMerchantSession();
  if (!session) return expired();
  // réservé au gérant (connexion e-mail + mot de passe), comme dans la passerelle walty.fr
  if (!(await getMerchantRole())?.manager) {
    return Response.json({ ok: false, error: "Réservé au gérant : connectez-vous avec votre e-mail et votre mot de passe." }, { status: 403 });
  }
  if (await isEssentiel(session.businessId)) return planRefused();
  const supabase = createAdminClient();
  const biz = session.businessId;
  const since6m = monthStart(5).toISOString();
  const since90 = new Date(Date.now() - 90 * DAY_MS).toISOString();

  let visits: { created_at: string; event_type: string; amount: number | null }[];
  let rewards: { event_type: string }[];
  let customers: unknown[];
  try {
    [visits, rewards, customers] = await Promise.all([
      fetchAll<{ created_at: string; event_type: string; amount: number | null }>((from, to) =>
        supabase
          .from("stamp_events")
          .select("id, created_at, event_type, amount")
          .eq("business_id", biz)
          .in("event_type", [...VISIT_TYPES])
          .is("undone_at", null)
          .gte("created_at", since6m)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      fetchAll<{ event_type: string }>((from, to) =>
        supabase
          .from("stamp_events")
          .select("id, event_type")
          .eq("business_id", biz)
          .in("event_type", [...REWARD_TYPES])
          .is("undone_at", null)
          .gte("created_at", new Date(Date.now() - 30 * DAY_MS).toISOString())
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("customers")
          .select("id, created_at, last_visit_at, marketing_optin, cards(lifetime_visits, wallet_platform)")
          .eq("business_id", biz)
          .order("id")
          .range(from, to),
      ),
    ]);
  } catch (err) {
    console.error("[espace insights]", (err as Error).message);
    return json({ ok: false, error: "Impossible de charger vos chiffres détaillés. Réessayez." }, 500);
  }

  // Affluence (90 derniers jours) : par jour de la semaine (lundi → dimanche) et par heure
  const weekday = Array(7).fill(0) as number[];
  const hours = Array(24).fill(0) as number[];
  // 6 derniers mois : passages, achats, nouveaux clients
  const months = Array.from({ length: 6 }, (_, i) => {
    const start = monthStart(5 - i);
    return { month: new Date(start.getTime() - GP_OFFSET_MS).toISOString().slice(0, 7), visits: 0, sales: 0, newCustomers: 0 };
  });
  const monthIndex = (iso: string) => months.findIndex((m) => m.month === new Date(Date.parse(iso) - GP_OFFSET_MS).toISOString().slice(0, 7));
  for (const v of visits) {
    const local = new Date(Date.parse(v.created_at) - GP_OFFSET_MS);
    if (v.created_at >= since90) {
      weekday[(local.getUTCDay() + 6) % 7]++;
      hours[local.getUTCHours()]++;
    }
    const i = monthIndex(v.created_at);
    if (i >= 0) {
      months[i].visits++;
      if (v.event_type === "purchase") months[i].sales += Number(v.amount ?? 0);
    }
  }
  months.forEach((m) => (m.sales = Math.round(m.sales * 100) / 100));

  type Row = { created_at: string; last_visit_at: string | null; marketing_optin: boolean; cards: { lifetime_visits: number; wallet_platform: string | null }[] | null };
  const rows = customers as Row[];
  const now = Date.now();
  const wallets = { apple: 0, google: 0, web: 0, none: 0 };
  let returning = 0;
  let dormant = 0;
  let totalVisits = 0;
  let optin = 0;
  for (const c of rows) {
    const card = c.cards?.[0];
    const n = card?.lifetime_visits ?? 0;
    totalVisits += n;
    if (n >= 2) returning++;
    if (c.marketing_optin) optin++;
    const last = c.last_visit_at ? Date.parse(c.last_visit_at) : Date.parse(c.created_at);
    if (now - last > 60 * DAY_MS) dormant++;
    const w = card?.wallet_platform;
    if (w === "apple" || w === "google" || w === "web") wallets[w]++;
    else wallets.none++;
    const i = monthIndex(c.created_at);
    if (i >= 0) months[i].newCustomers++;
  }

  const rewardsByType: Record<string, number> = {};
  for (const r of rewards) rewardsByType[r.event_type] = (rewardsByType[r.event_type] ?? 0) + 1;

  return json({
    ok: true,
    insights: {
      customers: rows.length,
      returning,
      returningRate: rows.length ? Math.round((returning / rows.length) * 100) : 0,
      dormant,
      avgVisits: rows.length ? Math.round((totalVisits / rows.length) * 10) / 10 : 0,
      optinRate: rows.length ? Math.round((optin / rows.length) * 100) : 0,
      weekday,
      hours,
      months,
      wallets,
      rewards30: rewardsByType,
    },
  });
}
