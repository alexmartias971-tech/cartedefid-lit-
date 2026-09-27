import { NextResponse } from "next/server";
import { endMerchantSession } from "@/lib/merchant-session";

export async function POST() {
  await endMerchantSession();
  return NextResponse.json({ ok: true });
}
