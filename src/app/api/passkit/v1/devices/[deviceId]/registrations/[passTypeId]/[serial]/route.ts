import { authorizeApplePass } from "@/lib/apple/webservice";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ deviceId: string; passTypeId: string; serial: string }> };

/** Un iPhone vient d'ajouter la carte : on retient son adresse de notification. */
export async function POST(request: Request, ctx: Ctx) {
  const { deviceId, passTypeId, serial } = await ctx.params;
  const card = await authorizeApplePass(request, passTypeId, serial);
  if (!card) return new Response(null, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { pushToken?: string };
  if (!body.pushToken) return new Response(null, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("apple_device_registrations")
    .select("id")
    .eq("device_library_id", deviceId)
    .eq("card_id", card.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("apple_device_registrations").update({ push_token: body.pushToken }).eq("id", existing.id);
    return new Response(null, { status: 200 });
  }
  await supabase
    .from("apple_device_registrations")
    .insert({ device_library_id: deviceId, push_token: body.pushToken, card_id: card.id });
  return new Response(null, { status: 201 });
}

/** L'iPhone a supprimé la carte. */
export async function DELETE(request: Request, ctx: Ctx) {
  const { deviceId, passTypeId, serial } = await ctx.params;
  const card = await authorizeApplePass(request, passTypeId, serial);
  if (!card) return new Response(null, { status: 401 });
  await createAdminClient()
    .from("apple_device_registrations")
    .delete()
    .eq("device_library_id", deviceId)
    .eq("card_id", card.id);
  return new Response(null, { status: 200 });
}
