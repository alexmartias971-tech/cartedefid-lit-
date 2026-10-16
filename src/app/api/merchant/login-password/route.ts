import { NextResponse } from "next/server";
import { startMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Le commerçant se connecte avec son e-mail (ou son identifiant) et son mot de passe
 * (espace commerçant de walty.fr). Comptes créés par Walty depuis le CRM (table merchant_logins).
 * Un bon mot de passe ouvre exactement la même session que le code PIN : startMerchantSession(scanner_id).
 * - Mot de passe vérifié dans la base (bcrypt), 5 erreurs => blocage 15 minutes.
 * - Même message que l'identifiant existe ou non (on ne révèle pas qui a un compte).
 * - Le mot de passe n'est jamais écrit dans les journaux ni renvoyé.
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
  const raw = await request.text().catch(() => "");
  if (raw.length > 2000) return fail("Demande trop longue.", 413);
  let body: { login?: unknown; password?: unknown } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const login = typeof body.login === "string" ? body.login.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!login || !password) return fail("Indiquez votre e-mail (ou votre identifiant) et votre mot de passe.", 400);
  if (login.length > 120 || password.length > 200) return fail("Identifiant ou mot de passe incorrect.", 401);

  const { data, error } = await createAdminClient().rpc("verify_merchant_login", { p_login: login, p_password: password });
  if (error) return fail("Erreur serveur, réessayez.", 500);
  const result = data as { ok: boolean; error?: string; scanner_id?: string; must_change_password?: boolean; locked?: boolean };
  if (!result?.ok || !result.scanner_id) {
    return fail(result?.error || "Identifiant ou mot de passe incorrect.", result?.locked ? 429 : 401, result?.locked ? { locked: true } : {});
  }

  await startMerchantSession(result.scanner_id);
  return NextResponse.json({ ok: true, mustChangePassword: !!result.must_change_password }, { headers: NO_STORE });
}
