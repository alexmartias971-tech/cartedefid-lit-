import { NextResponse } from "next/server";
import { startMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";

/** Le commerçant tape son code PIN. */
export async function POST(request: Request) {
  const { token, pin } = (await request.json().catch(() => ({}))) as { token?: string; pin?: string };
  if (!token || !pin || !/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ ok: false, error: "Tape un code PIN de 4 à 8 chiffres." }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("verify_merchant_pin", { p_token: token, p_pin: pin });
  if (error) return NextResponse.json({ ok: false, error: "Erreur serveur, réessaie." }, { status: 500 });
  const result = data as { ok: boolean; error?: string; scanner_id?: string };
  if (!result.ok || !result.scanner_id) return NextResponse.json({ ok: false, error: result.error }, { status: 401 });

  await startMerchantSession(result.scanner_id);
  return NextResponse.json({ ok: true });
}
