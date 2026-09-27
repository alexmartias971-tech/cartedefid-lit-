import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** L'iPhone demande : "quelles cartes ont changé depuis ma dernière visite ?" */
export async function GET(request: Request, ctx: { params: Promise<{ deviceId: string; passTypeId: string }> }) {
  const { deviceId, passTypeId } = await ctx.params;
  if (passTypeId !== process.env.APPLE_PASS_TYPE_ID) return new Response(null, { status: 404 });

  const since = Number(new URL(request.url).searchParams.get("passesUpdatedSince") ?? "0") || 0;
  const { data } = await createAdminClient()
    .from("apple_device_registrations")
    .select("cards!inner(serial_number, updated_at)")
    .eq("device_library_id", deviceId);

  const cards = ((data ?? []) as unknown as { cards: { serial_number: string; updated_at: string } }[]).map(
    (r) => r.cards,
  );
  if (cards.length === 0) return new Response(null, { status: 404 });

  const updated = cards.filter((c) => new Date(c.updated_at).getTime() > since);
  if (updated.length === 0) return new Response(null, { status: 204 });

  const lastUpdated = Math.max(...updated.map((c) => new Date(c.updated_at).getTime()));
  return NextResponse.json({ serialNumbers: updated.map((c) => c.serial_number), lastUpdated: String(lastUpdated) });
}
