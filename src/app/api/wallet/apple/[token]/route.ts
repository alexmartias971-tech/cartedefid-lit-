import { buildApplePass } from "@/lib/apple/pass";
import { loadCardBundle } from "@/lib/cards";
import { isAppleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/** Téléchargement de la carte Apple Wallet (bouton "Ajouter à Apple Wallet"). */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isAppleConfigured()) return new Response("Apple Wallet n'est pas encore configuré.", { status: 503 });
  const bundle = await loadCardBundle("web_token", token);
  if (!bundle || bundle.business.status !== "active") return new Response("Carte introuvable", { status: 404 });

  try {
    const pkpass = await buildApplePass(bundle);
    if (!bundle.card.wallet_platform || bundle.card.wallet_platform === "web") {
      await createAdminClient().from("cards").update({ wallet_platform: "apple" }).eq("id", bundle.card.id);
    }
    return new Response(new Uint8Array(pkpass), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="carte-fidelite.pkpass"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[apple pass]", err);
    return new Response("Impossible de générer la carte Apple. Vérifie les certificats.", { status: 500 });
  }
}
