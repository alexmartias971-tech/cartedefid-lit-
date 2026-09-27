import { NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";

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
      "id, first_name, last_name, phone, email, last_visit_at, marketing_optin, cards(stamps_count, rewards_redeemed)",
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
      .eq("event_type", "stamp")
      .is("undone_at", null)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("business_id", session.businessId)
      .eq("event_type", "reward_redeemed"),
  ]);

  return NextResponse.json({
    ok: true,
    customers: customers ?? [],
    stats: { total: total.count ?? 0, stampsThisMonth: stampsMonth.count ?? 0, rewardsRedeemed: rewards.count ?? 0 },
  });
}
