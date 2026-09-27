import { buildApplePass } from "@/lib/apple/pass";
import { authorizeApplePass } from "@/lib/apple/webservice";
import { loadCardBundle } from "@/lib/cards";

/** L'iPhone télécharge la dernière version de la carte. */
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
  const pkpass = await buildApplePass(bundle);
  return new Response(new Uint8Array(pkpass), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Last-Modified": updatedAt.toUTCString(),
      "Cache-Control": "no-store",
    },
  });
}
