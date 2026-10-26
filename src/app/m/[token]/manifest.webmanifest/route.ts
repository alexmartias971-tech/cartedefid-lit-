import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { webManifest } from "@/lib/web-manifest";

/** La caisse mise sur l'écran d'accueil d'un employé rouvre CETTE caisse (et pas la page d'accueil du site). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const { data } = await createAdminClient().from("scanner_access").select("is_active, businesses(name, status)").eq("access_token", token).maybeSingle();
  const biz = data?.businesses as unknown as { name: string; status: string } | null;
  // comme « me » : un accès désactivé (ou un commerce arrêté) ne dit rien
  if (!data || !data.is_active || !biz || biz.status !== "active") return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const name = biz.name;
  return webManifest({ name: `Caisse ${name}`.trim(), shortName: "Caisse", start: `/m/${token}`, theme: "#0b6474", background: "#f4f7f6" });
}
