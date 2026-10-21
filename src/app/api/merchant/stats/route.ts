import { NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/merchant-session";
import { fetchAll } from "@/lib/merchant-space";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEssentiel, planRefused } from "@/lib/walty-plan";
import { getMerchantRole } from "@/lib/merchant-role";

const DAY = 86400000;
const GP_OFFSET = 4 * 3600 * 1000; // Guadeloupe = UTC-4, sans heure d'été
/** "2026-10-15" : le jour en heure de Guadeloupe */
const gpDay = (t: number) => new Date(t - GP_OFFSET).toISOString().slice(0, 10);
/** Minuit (heure de Guadeloupe) du 1er du mois, décalé de `back` mois */
function monthStart(back = 0) {
  const now = new Date(Date.now() - GP_OFFSET);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1) + GP_OFFSET);
}

/** Statistiques du commerce, pour l'espace commerçant (walty.fr/espace). Formule Essentiel : 403 (Tout compris seulement). */
export async function GET() {
  const session = await getMerchantSession();
  if (!session) return NextResponse.json({ ok: false, error: "Session expirée : retapez votre code PIN." }, { status: 401 });
  // réservé au gérant (connexion e-mail + mot de passe), comme dans la passerelle walty.fr
  if (!(await getMerchantRole())?.manager) {
    return Response.json({ ok: false, error: "Réservé au gérant : connectez-vous avec votre e-mail et votre mot de passe." }, { status: 403 });
  }
  if (await isEssentiel(session.businessId)) return planRefused();
  const supabase = createAdminClient();
  const biz = session.businessId;
  const thisMonth = monthStart(0).toISOString();
  const lastMonth = monthStart(1).toISOString();
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const todayStart = Date.parse(`${gpDay(Date.now())}T00:00:00-04:00`);
  const since14 = new Date(todayStart - 13 * DAY).toISOString();

  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const visits = () =>
    supabase.from("stamp_events").select("id", { count: "exact", head: true }).eq("business_id", biz).in("event_type", ["stamp", "purchase"]).is("undone_at", null);
  const rewards = () =>
    supabase
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", biz)
      .in("event_type", ["reward_redeemed", "points_redeemed", "coupon_used", "cashback_used"])
      .is("undone_at", null);
  const customers = () => supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", biz);

  const [
    total,
    newThisMonth,
    newLastMonth,
    active30,
    optin,
    visitsThisMonth,
    visitsLastMonth,
    rewardsThisMonth,
    rewardsTotal,
    { data: recent },
    { data: sales },
    { data: top },
  ] = await Promise.all([
    count(customers()),
    count(customers().gte("created_at", thisMonth)),
    count(customers().gte("created_at", lastMonth).lt("created_at", thisMonth)),
    count(customers().gte("last_visit_at", since30)),
    count(customers().eq("marketing_optin", true)),
    count(visits().gte("created_at", thisMonth)),
    count(visits().gte("created_at", lastMonth).lt("created_at", thisMonth)),
    count(rewards().gte("created_at", thisMonth)),
    count(rewards()),
    // Supabase renvoie 1 000 lignes au maximum par demande (même avec .limit(10000)) : on lit par pages
    fetchAll<{ created_at: string }>((from, to) =>
      supabase
        .from("stamp_events")
        .select("id, created_at")
        .eq("business_id", biz)
        .in("event_type", ["stamp", "purchase"])
        .is("undone_at", null)
        .gte("created_at", since14)
        .order("id")
        .range(from, to),
    ).then(
      (data) => ({ data }),
      (err: Error) => (console.error("[stats]", err.message), { data: null }),
    ),
    fetchAll<{ amount: number | null }>((from, to) =>
      supabase
        .from("stamp_events")
        .select("id, amount")
        .eq("business_id", biz)
        .eq("event_type", "purchase")
        .is("undone_at", null)
        .gte("created_at", thisMonth)
        .order("id")
        .range(from, to),
    ).then(
      (data) => ({ data }),
      (err: Error) => (console.error("[stats]", err.message), { data: null }),
    ),
    supabase
      .from("customers")
      .select("first_name, last_name, last_visit_at, cards(lifetime_visits)")
      .eq("business_id", biz)
      .order("last_visit_at", { ascending: false, nullsFirst: false })
      .limit(300),
  ]);

  // Passages par jour, sur les 14 derniers jours
  const days: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) days.push({ day: gpDay(todayStart - i * DAY + GP_OFFSET), count: 0 });
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const e of recent ?? []) {
    const d = byDay.get(gpDay(Date.parse(e.created_at)));
    if (d) d.count++;
  }

  // Les clients les plus fidèles (nombre de passages)
  type TopRow = { first_name: string; last_name: string | null; last_visit_at: string | null; cards: { lifetime_visits: number }[] | null };
  const best = ((top ?? []) as TopRow[])
    .map((c) => ({
      name: `${c.first_name} ${c.last_name ? `${c.last_name.charAt(0)}.` : ""}`.trim(),
      visits: c.cards?.[0]?.lifetime_visits ?? 0,
      last_visit_at: c.last_visit_at,
    }))
    .filter((c) => c.visits > 0)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 5);

  return NextResponse.json(
    {
      ok: true,
      stats: {
        total,
        newThisMonth,
        newLastMonth,
        active30,
        optin,
        visitsThisMonth,
        visitsLastMonth,
        rewardsThisMonth,
        rewardsTotal,
        salesThisMonth: Math.round((sales ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0) * 100) / 100,
        daily: days,
        best,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
