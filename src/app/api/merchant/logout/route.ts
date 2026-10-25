import { NextResponse } from "next/server";
import { forgetDevice } from "@/lib/merchant-device";
import { endMerchantSession } from "@/lib/merchant-session";

export async function POST() {
  await endMerchantSession();
  // « Quitter » : cet appareil est oublié (plus de reconnexion automatique)
  await forgetDevice();
  return NextResponse.json({ ok: true });
}
