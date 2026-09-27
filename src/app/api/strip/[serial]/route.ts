import { loadCardBundle } from "@/lib/cards";
import { computeCardState } from "@/lib/card-state";
import { renderStrip } from "@/lib/strip";

/** Bannière de la carte en image (utilisée par Google Wallet et la carte web). */
export async function GET(_req: Request, ctx: { params: Promise<{ serial: string }> }) {
  const { serial } = await ctx.params;
  const bundle = await loadCardBundle("serial_number", serial);
  if (!bundle) return new Response("Introuvable", { status: 404 });
  const state = computeCardState(bundle.program, bundle.card, bundle.tiers, bundle.catalog);
  const png = await renderStrip(bundle.program, state.stamps?.filled ?? 0, 3);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=60" },
  });
}
