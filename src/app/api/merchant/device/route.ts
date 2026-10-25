import { NextResponse } from "next/server";
import { renewFromDevice } from "@/lib/merchant-device";

/**
 * Appareil mémorisé 90 jours (application Walty Caisse) — voir src/lib/merchant-device.ts.
 *
 * POST : le badge de session (12 h) a expiré ; la passerelle de walty.fr demande un nouveau badge à partir du cookie
 *   « commercant_appareil » (vérifié dans la base : accès actif, commerce actif, « Déconnecter tous les appareils »,
 *   code PIN ou mot de passe inchangé). Refus => 401 et le cookie est effacé.
 * Après un changement de mot de passe sur CET appareil, c'est la route « password » elle-même qui met l'empreinte
 * à jour (jamais sur simple demande : un ancien employé encore connecté ne peut pas rattacher son appareil au
 * nouveau code PIN ou mot de passe). Rien n'est renvoyé du cookie ni des identifiants.
 */
const NO_STORE = { "Cache-Control": "no-store" };

/** Formulaire envoyé depuis un autre site (le navigateur l'indique dans « Origin ») : refusé. */
function crossSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false; // appel de serveur à serveur (passerelle walty.fr)
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  try {
    return new URL(origin).host !== host.split(",")[0].trim();
  } catch {
    return true;
  }
}

export async function POST(request: Request) {
  if (crossSite(request)) return NextResponse.json({ ok: false, error: "Demande refusée." }, { status: 403, headers: NO_STORE });
  const raw = await request.text().catch(() => "");
  if (raw.length > 500) return NextResponse.json({ ok: false, error: "Demande trop longue." }, { status: 413, headers: NO_STORE });

  const result = await renewFromDevice();
  if (!result.ok) {
    const status = result.reason === "erreur" ? 503 : 401;
    return NextResponse.json(
      { ok: false, reason: result.reason, error: status === 503 ? "Erreur serveur, réessayez." : "Appareil déconnecté : reconnectez-vous." },
      { status, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, role: result.role }, { headers: NO_STORE });
}
