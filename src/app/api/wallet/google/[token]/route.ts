import { NextResponse } from "next/server";
import { loadCardBundle } from "@/lib/cards";
import { isGoogleConfigured } from "@/lib/env";
import { googleSaveUrl, prepareGoogleSave } from "@/lib/google/wallet";
import { createAdminClient } from "@/lib/supabase/admin";

/** Bouton "Ajouter à Google Wallet" : crée la carte chez Google (seulement si besoin) puis envoie vers Google. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const t0 = performance.now();
  const { token } = await ctx.params;
  if (!isGoogleConfigured()) return new Response("Google Wallet n'est pas encore configuré.", { status: 503 });
  const bundle = await loadCardBundle("web_token", token);
  if (!bundle || bundle.business.status !== "active") return new Response("Carte introuvable", { status: 404 });
  const t1 = performance.now();

  try {
    const sent = await prepareGoogleSave(bundle);
    const t2 = performance.now();
    if (!bundle.card.google_saved || !bundle.card.wallet_platform || bundle.card.wallet_platform === "web") {
      await createAdminClient()
        .from("cards")
        .update({
          google_saved: true,
          ...(!bundle.card.wallet_platform || bundle.card.wallet_platform === "web" ? { wallet_platform: "google" } : {}),
        })
        .eq("id", bundle.card.id);
    }
    console.log(
      `[google wallet] ${Math.round(performance.now() - t0)} ms (carte ${Math.round(t1 - t0)}, Google ${Math.round(t2 - t1)} : modèle ${sent.classSent ? "envoyé" : "inchangé"}, carte ${sent.objectSent ? "envoyée" : "inchangée"})`,
    );
    return NextResponse.redirect(googleSaveUrl(bundle.card.serial_number), { status: 303 });
  } catch (err) {
    console.error("[google wallet]", err);
    return new Response("Impossible de créer la carte Google. Vérifie la configuration Google Wallet.", {
      status: 500,
    });
  }
}
