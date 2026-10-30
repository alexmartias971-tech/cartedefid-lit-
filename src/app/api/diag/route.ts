import { NextResponse } from "next/server";
import { loadCardBundle } from "@/lib/cards";
import { isGoogleConfigured } from "@/lib/env";
import { essaiGoogle, googleObjectState } from "@/lib/google/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCard } from "@/lib/wallet-sync";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Contrôle d'une carte, pour Walty seulement (27 oct. 2026 : vérifier Android sans téléphone Android).
 * Corps : { "card_id": "<uuid>", "message"?: "texte" }. Protégée par CRON_SECRET, comme /api/sync (appelée par la
 * fonction SQL crm_cartedefid_diag du CRM).
 * - sans message : ce que Google et Apple savent de la carte (rien n'est envoyé) ;
 * - avec message : ce message part vers CETTE carte seulement (iPhone et Android), comme un message du commerçant,
 *   et la réponse dit ce que chaque service a accepté (iPhone prévenus, message Google posé) ;
 * - avec "essai_google": true : toutes les options de carte partent chez Google sur des cartes d'essai à part
 *   (lib/google/wallet.ts, essaiGoogle) ; la carte donnée ne sert que de point de départ, elle n'est pas modifiée.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorisé", { status: 401 });
  }
  let cardId = "";
  let message = "";
  let essai = false;
  try {
    const body = (await request.json()) as { card_id?: unknown; message?: unknown; essai_google?: unknown };
    cardId = String(body?.card_id ?? "");
    message = typeof body?.message === "string" ? body.message.trim().slice(0, 180) : "";
    essai = body?.essai_google === true;
  } catch {
    // corps illisible : refusé juste en dessous
  }
  if (!UUID.test(cardId)) return NextResponse.json({ error: "card_id manquant" }, { status: 400 });

  const bundle = await loadCardBundle("id", cardId);
  if (!bundle) return NextResponse.json({ error: "Carte introuvable" }, { status: 422 });
  const supabase = createAdminClient();

  if (essai) {
    if (!isGoogleConfigured()) return NextResponse.json({ error: "Google Wallet n'est pas configuré" }, { status: 503 });
    const { data: avecLogo } = await supabase.from("businesses").select("id").not("logo_url", "is", null).limit(1).maybeSingle();
    const essais = await essaiGoogle(bundle, (avecLogo as { id: string } | null)?.id ?? null);
    return NextResponse.json(
      { ok: true, acceptees: essais.filter((e) => e.accepte).length, total: essais.length, essais },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const { count: iphones } = await supabase
    .from("apple_device_registrations")
    .select("push_token", { count: "exact", head: true })
    .eq("card_id", cardId);

  let envoi = null;
  if (message) {
    // même astuce que sendNotification : l'iPhone ne notifie que si le texte du message CHANGE
    const texte = bundle.card.last_message === message ? `${message}\u2060` : message;
    await supabase.from("cards").update({ last_message: texte }).eq("id", cardId);
    envoi = await syncCard(cardId, { header: bundle.business.name, body: message });
  }

  let google: unknown = null;
  if (bundle.card.google_saved && isGoogleConfigured()) {
    try {
      google = await googleObjectState(bundle);
    } catch (err) {
      google = { erreur: (err as Error).message.slice(0, 300) };
    }
  }

  return NextResponse.json(
    {
      ok: true,
      commerce: bundle.business.name,
      client: bundle.customer.first_name,
      bons_plans: bundle.customer.marketing_optin,
      wallet: bundle.card.wallet_platform,
      iphones: iphones ?? 0,
      google_enregistree: bundle.card.google_saved,
      envoi,
      google,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
