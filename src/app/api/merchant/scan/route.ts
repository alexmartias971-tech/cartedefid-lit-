import { NextResponse } from "next/server";
import { after } from "next/server";
import { loadCardBundle, loadCardBundlesByIds } from "@/lib/cards";
import { computeCardState, formatEuro, formatLap } from "@/lib/card-state";
import { getMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardBundle } from "@/lib/types";
import { syncCard, syncCards } from "@/lib/wallet-sync";

type Action = "lookup" | "stamp" | "redeem" | "purchase" | "reward" | "cashback" | "coupon" | "undo" | "lap";

/** Ce que l'écran du commerçant affiche après un scan. */
function view(bundle: CardBundle) {
  const { card, customer, program, tiers, catalog, coupons } = bundle;
  const state = computeCardState(program, card, tiers, catalog);
  return {
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
    lap_enabled: program.lap_times_enabled,
    best_lap: state.lap,
    rank: state.rank,
    streak: state.streak ? { count: state.streak.count, goal: state.streak.goal, thisWeek: state.streak.thisWeek } : null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Le commerçant a scanné le QR code d'une carte. Toutes les règles (limites par jour,
 * soldes suffisants, carte du bon commerce…) sont vérifiées dans la base de données.
 */
export async function POST(request: Request) {
  const session = await getMerchantSession();
  if (!session) return NextResponse.json({ ok: false, error: "Session expirée : retape ton code PIN." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    serial?: string;
    action?: Action;
    amount?: number | string;
    reward_id?: string;
    coupon_id?: string;
    lap_ms?: number;
  };
  const serial = (body.serial ?? "").trim().toLowerCase();
  if (!UUID.test(serial)) {
    return NextResponse.json({ ok: false, error: "Ce QR code n'est pas une carte de fidélité." }, { status: 400 });
  }

  const before = await loadCardBundle("serial_number", serial);
  if (!before) return NextResponse.json({ ok: false, error: "Carte inconnue." }, { status: 404 });
  if (before.program.business_id !== session.businessId) {
    return NextResponse.json({ ok: false, error: "Cette carte appartient à un autre commerce." }, { status: 403 });
  }
  if (body.action === "lookup") return NextResponse.json({ ok: true, ...view(before) });

  const amount = Math.round(Number(String(body.amount ?? "").replace(",", ".")) * 100) / 100;
  const base = { p_serial: serial, p_scanner_id: session.scannerId };
  let call: { fn: string; args: Record<string, unknown> } | null = null;
  switch (body.action) {
    case "stamp":
      call = { fn: "add_stamp", args: base };
      break;
    case "redeem":
      call = { fn: "redeem_reward", args: base };
      break;
    case "purchase":
      call = { fn: "record_purchase", args: { ...base, p_amount: amount } };
      break;
    case "cashback":
      call = { fn: "use_cashback", args: { ...base, p_amount: amount } };
      break;
    case "reward":
      if (!UUID.test(body.reward_id ?? "")) break;
      call = { fn: "redeem_catalog_reward", args: { ...base, p_reward_id: body.reward_id } };
      break;
    case "coupon":
      if (!UUID.test(body.coupon_id ?? "")) break;
      call = { fn: "use_coupon", args: { ...base, p_coupon_id: body.coupon_id } };
      break;
    case "undo":
      call = { fn: "undo_last_action", args: base };
      break;
    case "lap":
      call = { fn: "record_lap", args: { ...base, p_ms: Math.round(Number(body.lap_ms)) } };
      break;
  }
  if (!call) return NextResponse.json({ ok: false, error: "Action inconnue." }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(call.fn, call.args);
  if (error) {
    console.error("[scan]", call.fn, error.message);
    return NextResponse.json({ ok: false, error: "Erreur serveur, réessaie." }, { status: 500 });
  }
  const result = data as {
    ok: boolean;
    card_id?: string;
    error?: string;
    reward_ready?: boolean;
    points_added?: number;
    cashback_added?: number;
    bonus?: boolean;
    referrer_card_id?: string | null;
    improved?: boolean;
    best_ms?: number;
    previous_ms?: number | null;
    rank?: number | null;
    previous_rank?: number | null;
    total?: number;
    overtaken?: { card_id: string; rank: number }[];
  };
  if (!result.ok) return NextResponse.json(result, { status: 409 });

  const afterBundle = await loadCardBundle("serial_number", serial);
  const cardId = before.card.id;
  const businessName = before.business.name;

  // Message de confirmation pour le commerçant
  let done = "C'est enregistré ✓";
  if (body.action === "stamp") done = result.reward_ready ? "Tampon ajouté ✓ 🎁 Cadeau débloqué !" : "Tampon ajouté ✓";
  if (body.action === "redeem") done = "Cadeau validé ✓ Le compteur repart à zéro.";
  if (body.action === "purchase")
    done =
      before.program.mode === "points"
        ? `Achat enregistré ✓ +${result.points_added ?? 0} points`
        : `Achat enregistré ✓ +${formatEuro(result.cashback_added ?? 0)} sur la cagnotte`;
  if (body.action === "cashback") done = `${formatEuro(amount)} déduits de la cagnotte ✓`;
  if (body.action === "reward") done = "Cadeau validé ✓ Points déduits.";
  if (body.action === "coupon") done = "Offre validée ✓";
  if (body.action === "undo") done = "Dernier passage annulé.";
  if (body.action === "lap") {
    done = result.improved
      ? `⏱️ Nouveau record : ${formatLap(result.best_ms)}${result.previous_ms ? ` (avant : ${formatLap(result.previous_ms)})` : ""} ! Classement : P${result.rank}${result.total ? ` / ${result.total}` : ""}.`
      : `Pas de nouveau record (son record : ${formatLap(result.best_ms)}${result.rank ? `, P${result.rank}` : ""}).`;
  }
  // Bonus de série déclenché par ce passage ?
  const streakUp =
    afterBundle && before.program.streak_enabled && (afterBundle.card.streak_count ?? 0) > 0 &&
    afterBundle.card.streak_count % before.program.streak_goal === 0 && afterBundle.card.streak_week !== before.card.streak_week;
  if (streakUp) done += ` 🔥 Série de ${afterBundle!.card.streak_count} semaines : +${before.program.streak_bonus} en bonus !`;
  if (result.bonus && (body.action === "stamp" || body.action === "purchase")) done += ` ⚡ Heures boostées × ${before.program.bonus_multiplier}`;
  if (result.referrer_card_id) done += " 🤝 Le parrain a reçu son bonus.";

  // Mise à jour de la carte dans le téléphone du client, juste après la réponse
  const tierUp =
    afterBundle?.card.tier_id && afterBundle.card.tier_id !== before.card.tier_id
      ? afterBundle.tiers.find((t) => t.id === afterBundle.card.tier_id)
      : null;
  after(async () => {
    if (body.action === "lap" && result.improved) {
      const climbed = result.previous_rank && result.rank && result.rank < result.previous_rank;
      await syncCard(cardId, {
        header: businessName,
        body: climbed
          ? `⏱️ Nouveau record : ${formatLap(result.best_ms)} ! Tu passes P${result.rank} au classement 🏁`
          : `⏱️ Nouveau record : ${formatLap(result.best_ms)} ! Tu es P${result.rank} au classement 🏁`,
      });
      // Les pilotes dépassés : leur carte se met à jour (et une alerte s'ils acceptent les messages)
      const overtaken = (result.overtaken ?? []).slice(0, 30);
      if (overtaken.length > 0) {
        const bundles = await loadCardBundlesByIds(overtaken.map((o) => o.card_id));
        for (const b of bundles) {
          const pos = overtaken.find((o) => o.card_id === b.card.id)?.rank;
          await syncCards(
            [b],
            b.customer.marketing_optin
              ? { header: businessName, body: `⚠️ Un pilote vient de te dépasser : tu passes P${pos}. Reviens reprendre ta place ! 🏁` }
              : undefined,
          );
        }
      }
    } else if (streakUp) {
      await syncCard(cardId, {
        header: businessName,
        body: `🔥 ${afterBundle!.card.streak_count} semaines d'affilée ! Ton bonus de série est sur ta carte.`,
      });
    } else if (tierUp && ["stamp", "purchase"].includes(body.action!)) {
      await syncCard(cardId, { header: businessName, body: `🏆 Bravo, tu passes au niveau ${tierUp.name} !` });
    } else if (body.action === "stamp" && result.reward_ready) {
      await syncCard(cardId, { header: businessName, body: "🎁 Ton cadeau est débloqué ! Montre ta carte en caisse." });
    } else {
      await syncCard(cardId);
    }
    if (result.referrer_card_id) {
      await syncCard(result.referrer_card_id, {
        header: businessName,
        body: "🤝 Merci ! Un ami est venu grâce à toi : ton bonus parrainage est sur ta carte.",
      });
    }
  });

  return NextResponse.json({ ok: true, done, ...(afterBundle ? view(afterBundle) : {}) });
}
