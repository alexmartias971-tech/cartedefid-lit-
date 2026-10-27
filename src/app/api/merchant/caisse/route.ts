import { NextResponse } from "next/server";
import { after } from "next/server";
import { loadCardBundle } from "@/lib/cards";
import { computeCardState } from "@/lib/card-state";
import { getMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardBundle } from "@/lib/types";
import { visitInfo, type VisitInfo } from "@/lib/visit-info";
import { syncCard } from "@/lib/wallet-sync";

/**
 * MODE CAISSE (application Walty Caisse, walty.fr/espace?caisse=1) : la caméra reste allumée ; à chaque carte scannée,
 * UNE seule demande décide et, si c'est permis, ajoute le tampon tout de suite (sans rien toucher).
 *
 * POST { serial, force? } → toujours 200 (sauf session expirée : 401), avec « kind » :
 *   - « stamped »    : tampon ajouté (prénom, tampons après, cadeau débloqué ?) → écran VERT ;
 *   - « reward »     : cadeau prêt, AUCUN tampon ajouté → écran ORANGE « Valider le cadeau » (adresse scan, action redeem) ;
 *   - « today »      : déjà passé aujourd'hui (limite pas atteinte), AUCUN tampon → ORANGE ; force: true l'ajoute quand même
 *                      (la limite du jour reste vérifiée par la base, comme dans le scanner) ;
 *   - « limit »      : limite du jour atteinte → ROUGE (dépassement : gérant seulement, dans le scanner) ;
 *   - « paused »     : carte en pause → ROUGE ;
 *   - « other_mode » : carte à points / cagnotte → le scanner classique (montant à saisir) ;
 *   - « not_card » / « unknown » / « other_shop » : pas une carte de ce commerce → ROUGE ;
 *   - « refused »    : la base a refusé (règle vérifiée au dernier moment) → ROUGE avec son message.
 * Les règles restent celles de la base (add_stamp) ; « Annuler » et « Valider le cadeau » passent par l'adresse scan
 * habituelle (actions undo et redeem).
 *
 * Rapidité : session + carte EN MÊME TEMPS, puis la fiche éclair (4 lectures en même temps), puis add_stamp, puis la
 * réponse ; la carte n'est relue qu'APRÈS la réponse, pour mettre à jour le Wallet du client (after()).
 * Aucun numéro de carte n'est renvoyé.
 */
const NO_STORE = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Formulaire envoyé depuis un autre site (le navigateur l'indique dans « Origin ») : refusé. */
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

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

type StampResult = {
  ok: boolean;
  error?: string;
  card_id?: string;
  stamps?: number;
  added?: number;
  threshold?: number;
  reward_ready?: boolean;
  bonus?: boolean;
  referrer_card_id?: string | null;
};

/** Mise à jour du Wallet du client APRÈS la réponse (mêmes messages que l'adresse scan pour un tampon). */
function syncAfterStamp(before: CardBundle, result: StampResult, serial: string) {
  after(async () => {
    const afterBundle = await loadCardBundle("serial_number", serial).catch(() => null);
    const businessName = before.business.name;
    const cardId = before.card.id;
    const streakUp =
      afterBundle && before.program.streak_enabled && (afterBundle.card.streak_count ?? 0) > 0 &&
      afterBundle.card.streak_count % before.program.streak_goal === 0 && afterBundle.card.streak_week !== before.card.streak_week;
    const tierUp =
      afterBundle?.card.tier_id && afterBundle.card.tier_id !== before.card.tier_id
        ? afterBundle.tiers.find((t) => t.id === afterBundle.card.tier_id)
        : null;
    if (streakUp) {
      await syncCard(cardId, { header: businessName, body: `🔥 ${afterBundle!.card.streak_count} semaines d'affilée ! Ton bonus de série est sur ta carte.` });
    } else if (tierUp) {
      await syncCard(cardId, { header: businessName, body: `🏆 Bravo, tu passes au niveau ${tierUp.name} !` });
    } else if (result.reward_ready) {
      await syncCard(cardId, { header: businessName, body: "🎁 Ton cadeau est débloqué ! Montre ta carte en caisse." });
    } else {
      // tampon ordinaire : Android prévenu comme l'iPhone
      await syncCard(cardId, undefined, { notifyUpdate: true });
    }
    if (result.referrer_card_id) {
      await syncCard(result.referrer_card_id, {
        header: businessName,
        body: "🤝 Merci ! Un ami est venu grâce à toi : ton bonus parrainage est sur ta carte.",
      });
    }
  });
}

export async function POST(request: Request) {
  if (crossSite(request)) return reply({ ok: false, error: "Demande refusée." }, 403);
  const raw = await request.text().catch(() => "");
  if (raw.length > 1000) return reply({ ok: false, error: "Demande trop longue." }, 413);
  let body: { serial?: unknown; force?: unknown } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const serial = typeof body.serial === "string" ? body.serial.trim().toLowerCase() : "";
  const force = body.force === true;

  // La session et la carte EN MÊME TEMPS ; sans session valable, rien de la carte n'est renvoyé (401 d'abord).
  const [session, loaded] = await Promise.all([
    getMerchantSession(),
    UUID.test(serial)
      ? loadCardBundle("serial_number", serial).catch((err: Error) => (console.error("[caisse load]", err.message), "error" as const))
      : Promise.resolve(null),
  ]);
  if (!session) return reply({ ok: false, error: "Session expirée : retape ton code PIN." }, 401);
  if (!UUID.test(serial)) return reply({ ok: false, kind: "not_card", error: "Ce QR code n'est pas une carte de fidélité Walty." });
  if (loaded === "error") return reply({ ok: false, error: "Erreur serveur, réessaie." }, 500);
  if (!loaded) return reply({ ok: false, kind: "unknown", error: "Carte inconnue : ce n'est pas une carte de fidélité de votre commerce." });
  const bundle = loaded;
  if (bundle.program.business_id !== session.businessId) {
    return reply({ ok: false, kind: "other_shop", error: "Cette carte appartient à un autre commerce." });
  }

  const { card, customer, program } = bundle;
  const state = computeCardState(program, card, bundle.tiers, bundle.catalog);
  const base = {
    first_name: customer.first_name,
    customer_id: customer.id,
    mode: program.mode,
    reward: program.reward_description,
    stamps: state.stamps,
  };
  if (program.mode !== "stamps") return reply({ ok: true, kind: "other_mode", ...base });

  let visit: VisitInfo | null = null;
  try {
    visit = await visitInfo(bundle);
  } catch (err) {
    console.error("[caisse visite]", (err as Error).message);
    return reply({ ok: false, error: "Erreur serveur, réessaie." }, 500);
  }
  if (!visit.program_active) return reply({ ok: true, kind: "paused", ...base, visit });
  if (state.rewardReady) return reply({ ok: true, kind: "reward", ...base, visit });
  if (visit.limit_reached) return reply({ ok: true, kind: "limit", ...base, visit });
  if (visit.today_count > 0 && !force) return reply({ ok: true, kind: "today", ...base, visit });

  const { data, error } = await createAdminClient().rpc("add_stamp", { p_serial: serial, p_scanner_id: session.scannerId });
  if (error) {
    console.error("[caisse]", "add_stamp", error.message);
    return reply({ ok: false, error: "Erreur serveur, réessaie." }, 500);
  }
  const result = (data ?? { ok: false }) as StampResult;
  if (!result.ok) {
    if (result.reward_ready) return reply({ ok: true, kind: "reward", ...base, visit });
    const limit = /limite/i.test(result.error ?? "");
    return reply({ ok: true, kind: limit ? "limit" : "refused", ...base, visit, error: result.error ?? "Tampon refusé." });
  }

  syncAfterStamp(bundle, result, serial);
  const total = result.threshold ?? state.stamps?.total ?? program.reward_threshold;
  const filled = Math.min(result.stamps ?? (state.stamps?.filled ?? 0) + 1, total);
  let done = result.reward_ready ? "Tampon ajouté ✓ 🎁 Cadeau débloqué !" : "Tampon ajouté ✓";
  if (result.bonus) done += ` ⚡ Heures boostées × ${program.bonus_multiplier}`;
  if (result.referrer_card_id) done += " 🤝 Le parrain a reçu son bonus.";
  return reply({
    ok: true,
    kind: "stamped",
    ...base,
    stamps: { filled, total },
    added: result.added ?? 1,
    reward_ready: !!result.reward_ready,
    visit,
    done,
  });
}
