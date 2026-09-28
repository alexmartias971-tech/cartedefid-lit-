import { loadCardBundle } from "@/lib/cards";
import { renderCardStrip } from "@/lib/strip";

/** Bannière de la carte en image (utilisée par Google Wallet et la carte web). */
export async function GET(_req: Request, ctx: { params: Promise<{ serial: string }> }) {
  const { serial } = await ctx.params;
  const bundle = await loadCardBundle("serial_number", serial);
  if (!bundle) return new Response("Introuvable", { status: 404 });
  const png = await renderCardStrip(bundle, 3, "google");
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=60" },
  });
}
