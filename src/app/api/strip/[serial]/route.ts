import { loadCardBundle } from "@/lib/cards";
import { getGoogleHero } from "@/lib/wallet-images";

/** Bannière de la carte en image (utilisée par Google Wallet et la carte web), servie depuis le cache d'images. */
export async function GET(_req: Request, ctx: { params: Promise<{ serial: string }> }) {
  const { serial } = await ctx.params;
  const bundle = await loadCardBundle("serial_number", serial);
  if (!bundle) return new Response("Introuvable", { status: 404 });
  const { png } = await getGoogleHero(bundle);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Length": String(png.length), "Cache-Control": "public, max-age=60" },
  });
}
