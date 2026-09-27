import { NextResponse } from "next/server";
import { after } from "next/server";
import { getMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCard } from "@/lib/wallet-sync";

type Action = "lookup" | "stamp" | "redeem" | "undo";

/**
 * Le commerçant a scanné le QR code d'une carte.
 * - lookup : afficher le client et ses tampons
 * - stamp  : ajouter 1 tampon (limites anti-triche vérifiées dans la base)
 * - redeem : valider le cadeau (remet le compteur à zéro)
 * - undo   : annuler le dernier tampon (10 minutes max)
 */
export async function POST(request: Request) {
  const session = await getMerchantSession();
  if (!session)
    return NextResponse.json({ ok: false, error: "Session expirée : retape ton code PIN." }, { status: 401 });

  const { serial: raw, action } = (await request.json().catch(() => ({}))) as { serial?: string; action?: Action };
  const serial = (raw ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(serial)) {
    return NextResponse.json({ ok: false, error: "Ce QR code n'est pas une carte de fidélité." }, { status: 400 });
  }
  const supabase = createAdminClient();

  if (action === "lookup") {
    const { data } = await supabase
      .from("cards")
      .select(
        "id, stamps_count, customers(first_name, last_name), loyalty_programs!inner(business_id, reward_threshold, reward_description)",
      )
      .eq("serial_number", serial)
      .maybeSingle();
    const card = data as unknown as {
      stamps_count: number;
      customers: { first_name: string; last_name: string | null };
      loyalty_programs: { business_id: string; reward_threshold: number; reward_description: string };
    } | null;
    if (!card) return NextResponse.json({ ok: false, error: "Carte inconnue." }, { status: 404 });
    if (card.loyalty_programs.business_id !== session.businessId) {
      return NextResponse.json({ ok: false, error: "Cette carte appartient à un autre commerce." }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      first_name: card.customers.first_name,
      last_name: card.customers.last_name,
      stamps: card.stamps_count,
      threshold: card.loyalty_programs.reward_threshold,
      reward: card.loyalty_programs.reward_description,
      reward_ready: card.stamps_count >= card.loyalty_programs.reward_threshold,
    });
  }

  const fn = { stamp: "add_stamp", redeem: "redeem_reward", undo: "undo_last_stamp" }[
    action as Exclude<Action, "lookup">
  ];
  if (!fn) return NextResponse.json({ ok: false, error: "Action inconnue." }, { status: 400 });

  const { data, error } = await supabase.rpc(fn, { p_serial: serial, p_scanner_id: session.scannerId });
  if (error) return NextResponse.json({ ok: false, error: "Erreur serveur, réessaie." }, { status: 500 });
  const result = data as { ok: boolean; card_id?: string; reward_ready?: boolean; error?: string };

  if (result.ok && result.card_id) {
    const cardId = result.card_id;
    // Mise à jour de la carte dans le téléphone du client, juste après la réponse
    after(async () => {
      if (action === "stamp" && result.reward_ready) {
        const { data: b } = await supabase.from("businesses").select("name").eq("id", session.businessId).single();
        await syncCard(cardId, {
          header: b?.name ?? "Carte fidélité",
          body: "🎁 Ton cadeau est débloqué ! Montre ta carte en caisse.",
        });
      } else {
        await syncCard(cardId);
      }
    });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
