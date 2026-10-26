import { NextResponse } from "next/server";
import { loadCardBundle } from "@/lib/cards";
import { shopTheme } from "@/lib/shop-theme";
import { webManifest } from "@/lib/web-manifest";

/** La carte mise sur l'écran d'accueil du client (« Ajoute cette page à ton écran d'accueil ») rouvre SA carte. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bundle = /^[0-9a-f]{32}$/.test(token) ? await loadCardBundle("web_token", token).catch(() => null) : null;
  if (!bundle) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const bg = shopTheme(bundle.program).bg;
  return webManifest({ name: `${bundle.business.name} · Ma carte`, shortName: bundle.business.name, start: `/carte/${token}`, theme: bg, background: bg });
}
