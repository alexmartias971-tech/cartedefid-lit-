import { after, NextResponse } from "next/server";
import { loadCardBundle } from "@/lib/cards";
import { computeCardState, formatEuro } from "@/lib/card-state";
import { getMerchantRole } from "@/lib/merchant-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardBundle } from "@/lib/types";
import { visitInfo } from "@/lib/visit-info";
import { COUNTER_ACTIONS, syncCard } from "@/lib/wallet-sync";

/**
 * Actions « à la main », SANS scanner le QR code de la carte (espace commerçant de walty.fr, rubrique Scanner).
 * RÉSERVÉ AU GÉRANT : session ouverte par e-mail/identifiant + mot de passe (preuve signée commercant_role,
 * voir src/lib/merchant-role.ts) ; un employé (code PIN) reçoit 403. La base revérifie (merchant_manual_action) :
 * accès actif lié à un compte gérant, client du MÊME commerce, 30 actions à la main par commerce et par jour,
 * tampon hors limite du jour seulement avec une raison. Chaque action est notée (table merchant_manual_actions) :
 * l'historique affiche « ajouté à la main » / « hors limite » et l'accès qui l'a faite.
 * Le numéro de série de la carte (contenu du QR code) n'est jamais renvoyé au navigateur.
 *
 * POST { customer_id, action: "lookup" | "stamp" | "redeem" | "purchase" | "cashback" | "reward" | "coupon" | "undo" | "remove_stamp",
 *        amount?, reward_id?, coupon_id?, over_limit?: boolean, reason?: string }
 *
 * « Retirer un tampon » (action remove_stamp, gérant) : à tout moment (erreur, fraude), depuis la fiche du client ou le
 * résultat d'un scan, avec une raison obligatoire (3 caractères au moins). Jamais en dessous de 0 ; un cadeau déjà remis
 * n'est pas touché (seul le compteur en cours baisse). Fonction de la base merchant_remove_stamp (migration 019) :
 * événement « Tampon retiré » (-1, raison) dans l'historique, noté dans merchant_manual_actions, carte du téléphone mise à jour.
 */
type Action = "lookup" | "stamp" | "redeem" | "purchase" | "cashback" | "reward" | "coupon" | "undo" | "remove_stamp";
const ACTIONS: Action[] = ["lookup", "stamp", "redeem", "purchase", "cashback", "reward", "coupon", "undo", "remove_stamp"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
/** Début de la journée en Guadeloupe (UTC-4, sans heure d'été). */
const gpDayStart = () => {
  const d = new Date(Date.now() - 4 * 3600e3);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 4 * 3600e3).toISOString();
};

function crossSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false; // appel de serveur à serveur (passerelle walty.fr)
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  try {
    return new URL(origin).host !== host.split(",")[0].trim();
  } catch {
    return true;
  }
}

/** Ce que l'écran affiche (comme après un scan), sans numéro de série. */
function view(bundle: CardBundle) {
  const { card, customer, program, tiers, catalog, coupons } = bundle;
  const state = computeCardState(program, card, tiers, catalog);
  return {
    customer_id: customer.id,
    first_name: customer.first_name,
    last_name: customer.last_name,
    mode: program.mode,
    balance_label: state.balanceLabel,
    balance_value: state.balanceValue,
    stamps: state.stamps,
    sentence: state.sentence,
    reward: program.reward_description,
    reward_ready: program.mode === "stamps" && state.rewardReady,
    points: card.points_balance,
    cashback: Number(card.cashback_balance),
    points_per_euro: Number(program.points_per_euro),
    cashback_percent: Number(program.cashback_percent),
    tier: state.tier ? { name: state.tier.name, perk: state.tier.perk } : null,
    next_tier: state.nextTier ? { name: state.nextTier.tier.name, remaining: state.nextTier.remaining } : null,
    coupons: coupons.map((c) => ({ id: c.id, title: c.title, expires_at: c.expires_at })),
    catalog: catalog
      .filter((r) => r.is_active)
      .map((r) => ({ id: r.id, name: r.name, cost: r.cost, affordable: r.cost <= card.points_balance })),
  };
}

/**
 * Passages du jour de la carte, limite du programme, actions à la main restantes pour le commerce.
 * Tout est lu EN MÊME TEMPS (la fiche éclair donne aussi les passages du jour : une lecture de moins).
 */
async function counters(bundle: CardBundle, businessId: string) {
  const supabase = createAdminClient();
  const start = gpDayStart();
  const [manual, visit] = await Promise.all([
    supabase.from("merchant_manual_actions").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", start),
    // Fiche éclair (dernière visite, passages du jour, limite), comme après un scan
    visitInfo(bundle).catch(() => null),
  ]);
  const max = Number(bundle.program.max_stamps_per_day ?? 0);
  let today = visit?.today_count;
  if (today == null) {
    const { count } = await supabase
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("card_id", bundle.card.id)
      .in("event_type", ["stamp", "purchase"])
      .is("undone_at", null)
      .gte("created_at", start);
    today = count ?? 0;
  }
  return { visits_today: today, max_per_day: max, limit_reached: max > 0 && today >= max, manual_left: Math.max(0, 30 - (manual.count ?? 0)), visit };
}

export async function POST(request: Request) {
  if (crossSite(request)) return json({ ok: false, error: "Demande refusée." }, 403);
  const role = await getMerchantRole();
  if (!role) return json({ ok: false, error: "Session expirée : reconnectez-vous." }, 401);
  if (!role.manager) {
    return json(
      { ok: false, forbidden: true, error: "Réservé au gérant : connectez-vous avec votre e-mail et votre mot de passe. En caisse, scannez la carte du client." },
      403,
    );
  }
  const { session } = role;

  const raw = await request.text().catch(() => "");
  if (raw.length > 4000) return json({ ok: false, error: "Demande trop longue." }, 413);
  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const customerId = typeof body.customer_id === "string" ? body.customer_id.trim().toLowerCase() : "";
  const action = body.action as Action;
  if (!UUID.test(customerId)) return json({ ok: false, error: "Client introuvable." }, 404);
  if (!ACTIONS.includes(action)) return json({ ok: false, error: "Action inconnue." }, 400);

  // La carte du client, dans le commerce de la session uniquement (client et carte lus en même temps)
  const supabase = createAdminClient();
  const [{ data: customer }, { data: cardRow }] = await Promise.all([
    supabase.from("customers").select("id").eq("id", customerId).eq("business_id", session.businessId).maybeSingle(),
    supabase
      .from("cards")
      .select("id, loyalty_programs!inner(business_id)")
      .eq("customer_id", customerId)
      .eq("loyalty_programs.business_id", session.businessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!customer) return json({ ok: false, error: "Client introuvable." }, 404);
  const before = cardRow ? await loadCardBundle("id", cardRow.id) : null;
  if (!before || before.program.business_id !== session.businessId) {
    return json({ ok: false, error: "Ce client n'a pas encore de carte." }, 404);
  }

  if (action === "lookup") return json({ ok: true, ...view(before), ...(await counters(before, session.businessId)) });

  // Annuler : mêmes règles que d'habitude (dernier tampon / achat fait par CET accès, 10 minutes)
  if (action === "undo") {
    const { data, error } = await supabase.rpc("undo_last_action", { p_serial: before.card.serial_number, p_scanner_id: session.scannerId });
    if (error) {
      console.error("[manual undo]", error.message);
      return json({ ok: false, error: "Erreur serveur, réessayez." }, 500);
    }
    const r = data as { ok: boolean; error?: string };
    if (!r.ok) return json(r, 409);
    after(() => syncCard(before.card.id));
    const afterBundle = await loadCardBundle("id", before.card.id);
    return json({ ok: true, done: "Dernier passage annulé.", ...(afterBundle ? { ...view(afterBundle), ...(await counters(afterBundle, session.businessId)) } : {}) });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim().replace(/\s+/g, " ").slice(0, 200) : "";

  // Retirer 1 tampon (erreur, fraude) : raison obligatoire, jamais en dessous de 0, tout est revérifié par la base
  if (action === "remove_stamp") {
    if (before.program.mode !== "stamps") return json({ ok: false, error: "Cette carte ne fonctionne pas avec des tampons." }, 400);
    if (reason.length < 3) return json({ ok: false, error: "Indiquez la raison (3 caractères au moins)." }, 400);
    const { data, error } = await supabase.rpc("merchant_remove_stamp", { p_card: before.card.id, p_scanner: session.scannerId, p_reason: reason });
    if (error) {
      console.error("[manual remove_stamp]", error.message);
      return json({ ok: false, error: "Erreur serveur, réessayez." }, 500);
    }
    const r = data as { ok: boolean; error?: string; forbidden?: boolean; rate_limited?: boolean; was_ready?: boolean; stamps?: number };
    if (!r?.ok) return json(r ?? { ok: false, error: "Action impossible." }, r?.forbidden ? 403 : r?.rate_limited ? 429 : 409);
    // La carte du téléphone du client se met à jour juste après la réponse (sans notification)
    after(() => syncCard(before.card.id));
    const afterBundle = await loadCardBundle("id", before.card.id);
    return json({
      ok: true,
      done: `Tampon retiré ✓${r.was_ready ? " Le cadeau n'est plus prêt." : ""} (raison notée dans l'historique)`,
      removed: true,
      ...(afterBundle ? { ...view(afterBundle), ...(await counters(afterBundle, session.businessId)) } : {}),
    });
  }

  const overLimit = body.over_limit === true;
  if (overLimit && action !== "stamp") return json({ ok: false, error: "Le dépassement de la limite ne concerne que les tampons." }, 400);
  if (overLimit && reason.length < 3) return json({ ok: false, error: "Indiquez la raison du tampon hors limite." }, 400);
  const amount = Math.round(Number(String(body.amount ?? "").replace(",", ".")) * 100) / 100;
  if ((action === "purchase" || action === "cashback") && !(amount > 0)) return json({ ok: false, error: "Indiquez un montant." }, 400);
  const item = action === "reward" ? body.reward_id : action === "coupon" ? body.coupon_id : null;
  if ((action === "reward" || action === "coupon") && !(typeof item === "string" && UUID.test(item))) {
    return json({ ok: false, error: "Action inconnue." }, 400);
  }

  const { data, error } = await supabase.rpc("merchant_manual_action", {
    p_scanner_id: session.scannerId,
    p_customer_id: customerId,
    p_action: action,
    p_amount: action === "purchase" || action === "cashback" ? amount : null,
    p_item_id: typeof item === "string" ? item : null,
    p_over_limit: overLimit,
    p_reason: overLimit ? reason : null,
  });
  if (error) {
    console.error("[manual]", action, error.message);
    return json({ ok: false, error: "Erreur serveur, réessayez." }, 500);
  }
  const result = data as {
    ok: boolean;
    error?: string;
    reward_ready?: boolean;
    points_added?: number;
    cashback_added?: number;
    referrer_card_id?: string | null;
    over_limit?: boolean;
    limit_reached?: boolean;
    rate_limited?: boolean;
    forbidden?: boolean;
  };
  if (!result?.ok) {
    const extra = result?.limit_reached ? { visit: await visitInfo(before).catch(() => null) } : {};
    return json({ ...(result ?? { ok: false, error: "Action impossible." }), ...extra }, result?.forbidden ? 403 : result?.rate_limited ? 429 : 409);
  }

  const afterBundle = await loadCardBundle("id", before.card.id);
  const tag = result.over_limit ? " (hors limite, ajouté à la main)" : " (ajouté à la main)";
  let done = "C'est enregistré ✓";
  if (action === "stamp") done = result.reward_ready ? "Tampon ajouté ✓ 🎁 Cadeau débloqué !" : "Tampon ajouté ✓";
  if (action === "redeem") done = "Cadeau validé ✓ Le compteur repart à zéro.";
  if (action === "purchase")
    done =
      before.program.mode === "points"
        ? `Achat enregistré ✓ +${result.points_added ?? 0} points`
        : `Achat enregistré ✓ +${formatEuro(result.cashback_added ?? 0)} sur la cagnotte`;
  if (action === "cashback") done = `${formatEuro(amount)} déduits de la cagnotte ✓`;
  if (action === "reward") done = "Cadeau validé ✓ Points déduits.";
  if (action === "coupon") done = "Offre validée ✓";
  done += tag;
  if (result.referrer_card_id) done += " 🤝 Le parrain a reçu son bonus.";

  // Mise à jour de la carte dans le téléphone du client, juste après la réponse (comme après un scan)
  const cardId = before.card.id;
  const businessName = before.business.name;
  const tierUp =
    afterBundle?.card.tier_id && afterBundle.card.tier_id !== before.card.tier_id ? afterBundle.tiers.find((t) => t.id === afterBundle.card.tier_id) : null;
  after(async () => {
    if (tierUp && (action === "stamp" || action === "purchase")) {
      await syncCard(cardId, { header: businessName, body: `🏆 Bravo, tu passes au niveau ${tierUp.name} !` });
    } else if (action === "stamp" && result.reward_ready) {
      await syncCard(cardId, { header: businessName, body: "🎁 Ton cadeau est débloqué ! Montre ta carte en caisse." });
    } else {
      // passage ordinaire : Android prévenu comme l'iPhone quand le compteur change
      await syncCard(cardId, undefined, { notifyUpdate: COUNTER_ACTIONS.includes(action) });
    }
    if (result.referrer_card_id) {
      await syncCard(result.referrer_card_id, {
        header: businessName,
        body: "🤝 Merci ! Un ami est venu grâce à toi : ton bonus parrainage est sur ta carte.",
      });
    }
  });

  return json({
    ok: true,
    done,
    manual: true,
    over_limit: !!result.over_limit,
    can_undo: action === "stamp" || action === "purchase",
    ...(afterBundle ? { ...view(afterBundle), ...(await counters(afterBundle, session.businessId)) } : {}),
  });
}
