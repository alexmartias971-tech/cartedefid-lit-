import { after } from "next/server";
import { getApplePass } from "@/lib/apple/pass";
import { loadCardBundle } from "@/lib/cards";
import { isAppleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/** Téléchargement de la carte Apple Wallet (bouton "Ajouter à Apple Wallet"). */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const t0 = performance.now();
  const { token } = await ctx.params;
  if (!isAppleConfigured()) return new Response("Apple Wallet n'est pas encore configuré.", { status: 503 });
  const bundle = await loadCardBundle("web_token", token);
  if (!bundle || bundle.business.status !== "active") return new Response("Carte introuvable", { status: 404 });
  const t1 = performance.now();

  try {
    const pass = await getApplePass(bundle);
    if (!bundle.card.wallet_platform || bundle.card.wallet_platform === "web") {
      // Noté après l'envoi : le client n'attend pas cette écriture
      const cardId = bundle.card.id;
      after(async () => {
        await createAdminClient().from("cards").update({ wallet_platform: "apple" }).eq("id", cardId);
      });
    }
    const total = Math.round(performance.now() - t0);
    console.log(
      `[apple pass] ${pass.source} ${total} ms (carte ${Math.round(t1 - t0)}, images ${pass.ms.images}, signature ${pass.ms.sign}) ${Math.round(pass.buffer.length / 1024)} Ko`,
    );
    return new Response(new Uint8Array(pass.buffer), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Length": String(pass.buffer.length),
        "Content-Disposition": `attachment; filename="carte-fidelite.pkpass"`,
        "Cache-Control": "private, no-store",
        "Server-Timing": `card;dur=${Math.round(t1 - t0)}, images;dur=${pass.ms.images};desc="${pass.source}", sign;dur=${pass.ms.sign}, total;dur=${total}`,
      },
    });
  } catch (err) {
    console.error("[apple pass]", err);
    return new Response("Impossible de générer la carte Apple. Vérifie les certificats.", { status: 500 });
  }
}
