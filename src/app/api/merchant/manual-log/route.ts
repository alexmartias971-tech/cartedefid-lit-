import { NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Les passages faits « à la main » (sans scanner la carte), pour les badges de l'historique de walty.fr :
 * « ajouté à la main », « hors limite » (+ raison) et l'accès qui l'a fait.
 * - ?day=AAAA-MM-JJ : la journée (heure de Guadeloupe) du commerce de la session ;
 * - ?customer=<id du client> : les 200 dernières actions à la main pour ce client du commerce.
 * Réponse : { ok, items: { [id du passage]: { action, over_limit, reason, by, at } } }. Aucun numéro de carte.
 */
const NO_STORE = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

type Row = { stamp_event_id: string | null; action: string; over_limit: boolean; reason: string | null; scanner_label: string; created_at: string };

export async function GET(request: Request) {
  const session = await getMerchantSession();
  if (!session) return json({ ok: false, error: "Session expirée : reconnectez-vous." }, 401);
  const params = new URL(request.url).searchParams;
  const day = params.get("day") ?? "";
  const customer = params.get("customer") ?? "";
  const supabase = createAdminClient();

  let query = supabase
    .from("merchant_manual_actions")
    .select("stamp_event_id, action, over_limit, reason, scanner_label, created_at")
    .eq("business_id", session.businessId)
    .not("stamp_event_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const start = Date.parse(`${day}T00:00:00-04:00`);
    if (Number.isNaN(start)) return json({ ok: false, error: "Date invalide." }, 400);
    query = query.gte("created_at", new Date(start).toISOString()).lt("created_at", new Date(start + 86400000).toISOString());
  } else if (UUID.test(customer)) {
    const { data: cards } = await supabase
      .from("cards")
      .select("id, customers!inner(business_id)")
      .eq("customer_id", customer)
      .eq("customers.business_id", session.businessId);
    const ids = (cards ?? []).map((c: { id: string }) => c.id);
    if (ids.length === 0) return json({ ok: true, items: {} });
    query = query.in("card_id", ids);
  } else {
    return json({ ok: false, error: "Indiquez un jour ou un client." }, 400);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[manual-log]", error.message);
    return json({ ok: false, error: "Erreur serveur, réessayez." }, 500);
  }
  const items: Record<string, { action: string; over_limit: boolean; reason: string | null; by: string; at: string }> = {};
  for (const r of (data ?? []) as Row[]) {
    if (!r.stamp_event_id) continue;
    items[r.stamp_event_id] = { action: r.action, over_limit: r.over_limit, reason: r.reason, by: r.scanner_label || "Accès supprimé", at: r.created_at };
  }
  return json({ ok: true, items });
}
