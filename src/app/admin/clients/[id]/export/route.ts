import { requireAdmin } from "@/lib/admin-auth";

/** Toutes les données d'un client (droit d'accès RGPD), en fichier JSON. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase } = await requireAdmin();
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "*, consents(*), cards(serial_number, stamps_count, rewards_earned, rewards_redeemed, wallet_platform, created_at, stamp_events(event_type, delta, created_at, undone_at))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!customer) return new Response("Client introuvable", { status: 404 });
  return new Response(JSON.stringify(customer, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="donnees-client-${id}.json"`,
    },
  });
}
