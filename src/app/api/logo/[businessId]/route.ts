import { squareLogoPng } from "@/lib/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Program } from "@/lib/types";

/** Logo carré d'une entreprise en PNG (utilisé par Google Wallet). */
export async function GET(_req: Request, ctx: { params: Promise<{ businessId: string }> }) {
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
  const png = await squareLogoPng(business, loyalty_programs, 660);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
