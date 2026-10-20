import { after, NextResponse } from "next/server";
import { isResetMailConfigured, sendResetMail } from "@/lib/reset-mail";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * « Mot de passe oublié ? » (espace commerçant de walty.fr) : le commerçant tape son adresse e-mail.
 * - Toujours la même réponse, que l'adresse ait un compte ou non (on ne révèle pas qui est client).
 * - La base (request_merchant_reset) ne fabrique un lien que pour un compte actif dont l'identifiant est cette adresse,
 *   3 demandes par heure au plus ; elle ne garde que l'empreinte SHA-256 du jeton.
 * - L'e-mail part APRÈS la réponse (même temps de réponse dans tous les cas), avec Resend (RESEND_API_KEY).
 *   Sans clé : avertissement dans les journaux, la réponse ne change pas.
 * - Ni l'adresse ni le jeton ne sont écrits dans les journaux.
 * - GET : { ok, available: true, mail } — l'envoi d'e-mails est-il configuré (RESEND_API_KEY présente) ?
 *   Ne dit rien d'autre (ni la clé, ni l'expéditeur, ni aucun compte). Sans envoi possible, walty.fr affiche
 *   « Appelez Walty… » au lieu de promettre un e-mail, et POST ne fabrique aucun lien ({ ok, mail: false }).
 */
const NO_STORE = { "Cache-Control": "no-store" };
const GENERIC = "Si un compte existe avec cette adresse, vous allez recevoir un e-mail.";
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

export async function GET() {
  return NextResponse.json({ ok: true, available: true, mail: isResetMailConfigured() }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  if (crossSite(request)) return fail("Demande refusée.", 403);
  // Pas d'envoi d'e-mail possible : aucun lien n'est fabriqué (walty.fr affiche le téléphone et l'e-mail de Walty)
  if (!isResetMailConfigured()) return NextResponse.json({ ok: true, mail: false }, { headers: NO_STORE });
  const raw = await request.text().catch(() => "");
  if (raw.length > 1000) return fail("Demande trop longue.", 413);
  let body: { email?: unknown } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return fail("Indiquez votre adresse e-mail.", 400);
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Cette adresse e-mail ne semble pas valide. Vérifiez-la.", 400);
  }

  const { data, error } = await createAdminClient().rpc("request_merchant_reset", { p_login: email });
  if (error) return fail("Erreur serveur, réessayez.", 500);
  const result = data as { send?: boolean; email?: string; token?: string; business_name?: string } | null;
  if (result?.send && result.email && result.token) {
    const { email: to, token, business_name } = result;
    after(() => sendResetMail(to, token, business_name || ""));
  }
  return NextResponse.json({ ok: true, mail: true, done: GENERIC }, { headers: NO_STORE });
}
