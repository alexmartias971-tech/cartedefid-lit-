import QRCode from "qrcode";
import { loadCardBundle } from "@/lib/cards";
import { computeCardState } from "@/lib/card-state";
import { publicUrl } from "@/lib/env";
import { getMerchantSession } from "@/lib/merchant-session";
import { EVENT_SELECT, expired, json, mapEvent, undoableIds, UUID, type EventRow } from "@/lib/merchant-space";
import { createAdminClient } from "@/lib/supabase/admin";

const WALLETS: Record<string, string> = { apple: "Apple Wallet (iPhone)", google: "Google Wallet (Android)", web: "Carte web" };

/**
 * Fiche d'un client pour l'espace commerçant de walty.fr : état de sa carte et historique.
 * ?id=<identifiant du client> — refusé si le client n'appartient pas au commerce de la session.
 */
export async function GET(request: Request) {
  const session = await getMerchantSession();
  if (!session) return expired();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return json({ ok: false, error: "Client introuvable." }, 404);

  const supabase = createAdminClient();
  // le client et sa carte (du MÊME commerce) lus en même temps
  const [{ data: customer }, { data: cardRow }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email, marketing_optin, created_at, last_visit_at")
      .eq("id", id)
      .eq("business_id", session.businessId)
      .maybeSingle(),
    supabase
      .from("cards")
      .select("id, loyalty_programs!inner(business_id)")
      .eq("customer_id", id)
      .eq("loyalty_programs.business_id", session.businessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!customer) return json({ ok: false, error: "Client introuvable." }, 404);

  // la carte complète et son historique, en même temps
  const [bundle, eventsRes] = cardRow
    ? await Promise.all([
        loadCardBundle("id", cardRow.id),
        supabase
          .from("stamp_events")
          .select(EVENT_SELECT)
          .eq("card_id", cardRow.id)
          .eq("business_id", session.businessId)
          .order("created_at", { ascending: false })
          .limit(60),
      ])
    : [null, null];

  let card = null;
  let history: ReturnType<typeof mapEvent>[] = [];
  if (bundle && bundle.program.business_id === session.businessId) {
    const { card: c, program, tiers, catalog, coupons } = bundle;
    const state = computeCardState(program, c, tiers, catalog);
    // « Renvoyer sa carte » : le client a changé de téléphone, l'a supprimée ou ne se souvient plus de son prénom.
    // Il scanne ce QR en caisse (ou reçoit le lien) : sa carte s'ouvre, avec tous ses tampons, prête à remettre dans le Wallet.
    const lien = `${publicUrl()}/carte/${c.web_token}`;
    const lienQr = await QRCode.toDataURL(lien, { width: 360, margin: 1 }).catch(() => null);
    card = {
      lien,
      lien_qr: lienQr,
      mode: program.mode,
      wallet: c.wallet_platform ? WALLETS[c.wallet_platform] ?? c.wallet_platform : "Pas encore ajoutée au téléphone",
      balance_label: state.balanceLabel,
      balance_value: state.balanceValue,
      stamps: state.stamps,
      sentence: state.sentence,
      reward_ready: program.mode === "stamps" && state.rewardReady,
      reward: program.reward_description,
      tier: state.tier ? { name: state.tier.name, perk: state.tier.perk } : null,
      next_tier: state.nextTier ? { name: state.nextTier.tier.name, remaining: state.nextTier.remaining } : null,
      streak: state.streak,
      best_lap: state.lap,
      rank: state.rank,
      points: c.points_balance,
      cashback: Number(c.cashback_balance),
      lifetime_visits: c.lifetime_visits,
      lifetime_spent: Number(c.lifetime_spent),
      lifetime_points: c.lifetime_points,
      rewards_earned: c.rewards_earned,
      rewards_redeemed: c.rewards_redeemed,
      created_at: c.created_at,
      coupons: coupons.map((k) => ({ title: k.title, kind: k.kind, expires_at: k.expires_at })),
    };
    const rows = (eventsRes?.data ?? []) as unknown as EventRow[];
    const canUndo = undoableIds(rows, session.scannerId);
    history = rows.map((e) => mapEvent(e, canUndo.has(e.id)));
  }

  return json({
    ok: true,
    customer: {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      email: customer.email,
      marketing_optin: customer.marketing_optin,
      created_at: customer.created_at,
      last_visit_at: customer.last_visit_at,
    },
    card,
    history,
  });
}
