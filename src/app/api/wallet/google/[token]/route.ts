import { NextResponse } from "next/server";
import { loadCardBundle } from "@/lib/cards";
import { isGoogleConfigured } from "@/lib/env";
import { googleSaveUrl, upsertGoogleClass, upsertGoogleObject } from "@/lib/google/wallet";
import { createAdminClient } from "@/lib/supabase/admin";

/** Bouton "Ajouter à Google Wallet" : crée la carte chez Google puis envoie vers Google. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isGoogleConfigured()) return new Response("Google Wallet n'est pas encore configuré.", { status: 503 });
  const bundle = await loadCardBundle("web_token", token);
  if (!bundle || bundle.business.status !== "active") return new Response("Carte introuvable", { status: 404 });

  try {
    await upsertGoogleClass(bundle.program, bundle.business);
    await upsertGoogleObject(bundle);
    await createAdminClient()
      .from("cards")
      .update({
        google_saved: true,
        ...(!bundle.card.wallet_platform || bundle.card.wallet_platform === "web" ? { wallet_platform: "google" } : {}),
      })
      .eq("id", bundle.card.id);
    return NextResponse.redirect(googleSaveUrl(bundle.card.serial_number), { status: 303 });
  } catch (err) {
    console.error("[google wallet]", err);
    return new Response("Impossible de créer la carte Google. Vérifie la configuration Google Wallet.", {
      status: 500,
    });
  }
}
