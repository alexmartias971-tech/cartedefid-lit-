import { NextResponse } from "next/server";
import { currentLoginId, revokeAllDevices } from "@/lib/merchant-device";
import { getMerchantRole } from "@/lib/merchant-role";

/**
 * « Déconnecter tous les appareils » (gérant seulement, espace commerçant de walty.fr) : téléphone perdu, employé parti…
 * Toutes les sessions ouvertes et tous les appareils mémorisés de cet accès sont refusés tout de suite ;
 * l'appareil du gérant qui le demande reste connecté (nouveau badge émis juste après). Voir src/lib/merchant-device.ts.
 */
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...extra }, { status, headers: NO_STORE });

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
  if (crossSite(request)) return fail("Demande refusée.", 403);
  const role = await getMerchantRole();
  if (!role) return fail("Session expirée : reconnectez-vous.", 401);
  if (!role.manager) return fail("Réservé au gérant (connexion par e-mail et mot de passe).", 403, { forbidden: true });
  const loginId = await currentLoginId();
  if (!loginId) return fail("Réservé au gérant (connexion par e-mail et mot de passe).", 403, { forbidden: true });

  const result = await revokeAllDevices(role.session.scannerId, loginId);
  if (!result.ok) return fail("Erreur serveur, réessayez.", 500);
  return NextResponse.json({ ok: true, revokedAt: result.revokedAt, done: "Tous les autres appareils sont déconnectés." }, { headers: NO_STORE });
}
