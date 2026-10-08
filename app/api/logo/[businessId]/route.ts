import { googleLogoPng, googleWideLogoPng } from "@/lib/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Program } from "@/lib/types";

/**
 * Logo d'une entreprise en PNG pour Google Wallet :
 *  - par défaut : 660 × 660 sur fond plein (Google le découpe en rond) ;
 *  - ?wide=1 : logo large 1280 × 400 (remplace le logo rond et le nom en haut de la carte Android).
 */
export async function GET(req: Request, ctx: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return new Response("Introuvable", { status: 404 });
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("businesses")
    .select("*, loyalty_programs(*)")
    .eq("id", businessId)
    .maybeSingle();
  if (!data) return new Response("Introuvable", { status: 404 });
  const { loyalty_programs, ...business } = data as Business & { loyalty_programs: Program | null };
  const wide = new URL(req.url).searchParams.get("wide") === "1";
  const png = wide ? await googleWideLogoPng(business) : await googleLogoPng(business, loyalty_programs);
  if (!png) return new Response("Pas de logo", { status: 404 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
