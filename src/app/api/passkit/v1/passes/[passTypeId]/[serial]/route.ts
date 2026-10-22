import { getApplePass } from "@/lib/apple/pass";
import { authorizeApplePass } from "@/lib/apple/webservice";
import { loadCardBundle } from "@/lib/cards";

/** L'iPhone télécharge la dernière version de la carte (même cache que le bouton « Ajouter à Apple Wallet »). */
export async function GET(request: Request, ctx: { params: Promise<{ passTypeId: string; serial: string }> }) {
  const { passTypeId, serial } = await ctx.params;
  const card = await authorizeApplePass(request, passTypeId, serial);
  if (!card) return new Response(null, { status: 401 });

  const updatedAt = new Date(card.updated_at);
  updatedAt.setMilliseconds(0);
  const since = request.headers.get("if-modified-since");
  if (since && new Date(since).getTime() >= updatedAt.getTime()) return new Response(null, { status: 304 });

  const bundle = await loadCardBundle("serial_number", serial);
  if (!bundle) return new Response(null, { status: 404 });
  const { buffer } = await getApplePass(bundle);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Length": String(buffer.length),
      "Last-Modified": updatedAt.toUTCString(),
      "Cache-Control": "no-store",
    },
  });
}
