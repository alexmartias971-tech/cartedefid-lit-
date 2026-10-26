import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { forgetDevice } from "@/lib/merchant-device";
import { ROLE_COOKIE, startAdminSession } from "@/lib/merchant-role";
import { startMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Entrée Walty (26 oct. 2026) : Alexandre ouvre, depuis le CRM, l'espace gérant ou une caisse de n'importe quel commerce, sans
 * mot de passe ni code secret. Le CRM (admin connecté, fonction crm-acces « entree ») crée un ticket à usage unique valable
 * 2 minutes, placé après « # » dans l'adresse (jamais envoyé aux serveurs, ni lu par les aperçus de liens des messageries).
 * La page qui l'ouvre l'envoie ici en POST { jeton, cible } ; on l'échange (fonction crm_entree_utiliser : une seule fois, pour
 * l'espace prévu, accès et commerce actifs) contre une session :
 * - cible « caisse » (page /entree de carte.walty.fr) : session sur CET accès caisse ; réponse { vers: "/m/<lien>" } ;
 * - cible « gerant » (espace de walty.fr, via sa passerelle) : session + preuve « Walty » (rubriques du gérant, 2 h).
 * Dans les deux cas, l'ancienne connexion du navigateur (un autre commerce, l'appareil mémorisé) est remplacée.
 */
const NO_STORE = { "Cache-Control": "no-store" };
type Ticket = { ok: boolean; error?: string; scanner_id?: string; cible?: "gerant" | "caisse"; access_token?: string };
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

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

/** Plus de ticket dans une adresse ouverte directement : la page /entree ou l'espace l'envoient en POST. */
export async function GET() {
  return fail("Ouvre l'entrée depuis le CRM.", 405);
}

export async function POST(request: Request) {
  if (crossSite(request)) return fail("Demande refusée.", 403);
  const raw = await request.text().catch(() => "");
  if (raw.length > 500) return fail("Demande trop longue.", 413);
  let jeton = "";
  let cible = "";
  try {
    const b = raw ? (JSON.parse(raw) as { jeton?: unknown; cible?: unknown }) : {};
    jeton = typeof b.jeton === "string" ? b.jeton.trim() : "";
    cible = b.cible === "caisse" ? "caisse" : b.cible === "gerant" ? "gerant" : "";
  } catch {
    jeton = "";
  }
  if (!cible || !/^[A-Za-z0-9_-]{40,64}$/.test(jeton)) return fail("Lien d'entrée invalide.", 400);

  const { data, error } = await createAdminClient().rpc("crm_entree_utiliser", { p_jeton: jeton, p_cible: cible });
  const t = (error ? null : data) as Ticket | null;
  if (!t) return fail("Erreur serveur, réessayez.", 500);
  if (!t.ok || !t.scanner_id) return fail(t.error || "Lien d'entrée expiré : rouvre-le depuis le CRM.", 401);

  await forgetDevice();
  if (cible === "caisse") {
    if (!t.access_token) return fail("Erreur serveur, réessayez.", 500);
    // une caisse = une session « employé » : pas de preuve gérant d'un autre commerce
    (await cookies()).delete(ROLE_COOKIE);
    await startMerchantSession(t.scanner_id);
    return NextResponse.json({ ok: true, vers: `/m/${t.access_token}` }, { headers: NO_STORE });
  }
  await startAdminSession(t.scanner_id);
  return NextResponse.json({ ok: true, role: "gerant", admin: true }, { headers: NO_STORE });
}
