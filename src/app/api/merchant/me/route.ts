import { NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Qui est connecté ? Utilisé par l'espace commerçant de walty.fr (walty.fr/espace).
 * - ?token=… (lien d'accès) : renvoie le nom et le logo du commerce, pour l'écran du code PIN
 *   (exactement ce qu'affiche déjà la page /m/<lien>).
 * - Si la session est ouverte (et correspond à ce lien) : renvoie aussi les infos de l'espace.
 */
export async function GET(request: Request) {
  const token = (new URL(request.url).searchParams.get("token") ?? "").trim().toLowerCase();
  if (token && !/^[0-9a-f]{48}$/.test(token)) {
    return NextResponse.json({ ok: false, error: "Lien d'accès invalide." }, { status: 404 });
  }
  const supabase = createAdminClient();

  // Avant le code PIN : seulement le nom et le logo du commerce (rien d'autre),
  // et seulement si l'accès est actif et le commerce actif.
  let access: { name: string; logo_url: string | null } | null = null;
  if (token) {
    const { data } = await supabase
      .from("scanner_access")
      .select("is_active, businesses(name, logo_url, status)")
      .eq("access_token", token)
      .maybeSingle();
    const biz = data?.businesses as unknown as { name: string; logo_url: string | null; status: string } | null;
    if (!data || !data.is_active || !biz || biz.status !== "active") {
      return NextResponse.json({ ok: false, error: "Lien d'accès invalide." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    access = { name: biz.name, logo_url: biz.logo_url };
  }

  const session = await getMerchantSession();
  if (!session || (token && session.accessToken !== token)) {
    return NextResponse.json({ ok: true, loggedIn: false, business: access }, { headers: { "Cache-Control": "no-store" } });
  }

  const [{ data: business }, { data: program }] = await Promise.all([
    supabase.from("businesses").select("name, logo_url, max_notifications_per_week").eq("id", session.businessId).single(),
    supabase
      .from("loyalty_programs")
      .select("name, mode, reward_threshold, reward_description, points_per_euro, cashback_percent, welcome_offer, birthday_offer, is_active")
      .eq("business_id", session.businessId)
      .maybeSingle(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      loggedIn: true,
      business: { name: business?.name ?? "", logo_url: business?.logo_url ?? null },
      label: session.label,
      canNotify: session.canSendNotifications,
      maxNotificationsPerWeek: business?.max_notifications_per_week ?? 0,
      program: program ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
