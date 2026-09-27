import { NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/merchant-session";
import { computeCardState } from "@/lib/card-state";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Program, Tier } from "@/lib/types";

/** Liste des clients et statistiques simples, pour le commerçant. */
export async function GET(request: Request) {
  const session = await getMerchantSession();
  if (!session)
    return NextResponse.json({ ok: false, error: "Session expirée : retape ton code PIN." }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").replace(/[%,()]/g, " ").trim();
  const supabase = createAdminClient();
  let query = supabase
    .from("customers")
    .select(
      "id, first_name, last_name, phone, email, last_visit_at, marketing_optin, cards(stamps_count, points_balance, cashback_balance, lifetime_visits, lifetime_spent, tier_id)",
    )
    .eq("business_id", session.businessId)
    .order("last_visit_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(4, 0, 0, 0);

  const [{ data: customers }, total, stampsMonth, rewards] = await Promise.all([
    query,
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", session.businessId),
    supabase
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", session.businessId)
      .in("event_type", ["stamp", "purchase"])
      .is("undone_at", null)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", session.businessId)
      .in("event_type", ["reward_redeemed", "points_redeemed", "coupon_used", "cashback_used"]),
  ]);

  const { data: programData } = await supabase
    .from("loyalty_programs")
    .select("*, program_tiers(*)")
    .eq("business_id", session.businessId)
    .single();
  const { program_tiers: tiers = [], ...program } = (programData ?? {}) as Program & { program_tiers?: Tier[] };
  type CardRow = {
    stamps_count: number;
    points_balance: number;
    cashback_balance: number;
    lifetime_visits: number;
    lifetime_spent: number;
    tier_id: string | null;
  };
  const list = ((customers ?? []) as (Record<string, unknown> & { cards: CardRow[] })[]).map(({ cards, ...c }) => {
    const card = cards?.[0];
    const state = card && programData ? computeCardState(program as Program, card, tiers) : null;
    return { ...c, balance: state?.balanceValue ?? "—", tier: state?.tier?.name ?? null };
  });

  return NextResponse.json({
    ok: true,
    customers: list,
    stats: { total: total.count ?? 0, stampsThisMonth: stampsMonth.count ?? 0, rewardsRedeemed: rewards.count ?? 0 },
  });
}
