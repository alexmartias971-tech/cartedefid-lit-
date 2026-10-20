import { NextResponse } from "next/server";
import { startManagerSession } from "@/lib/merchant-role";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Connexion du GÉRANT par e-mail (ou identifiant) + mot de passe (espace commerçant de walty.fr).
 * Même vérification que login-password (fonction verify_merchant_login : bcrypt, 5 erreurs => 15 min de blocage,
 * même message que le compte existe ou non), mais la session ouverte porte en plus la preuve « gérant »
 * (cookie signé commercant_role, voir src/lib/merchant-role.ts) : actions à la main, tampon hors limite,
 * Mon programme, Offres, Messages. La connexion par code PIN (login) reste une session « employé ».
 * Le mot de passe n'est jamais écrit dans les journaux ni renvoyé.
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

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("verify_merchant_login", { p_login: login, p_password: password });
  if (error) return fail("Erreur serveur, réessayez.", 500);
  const result = data as { ok: boolean; error?: string; scanner_id?: string; must_change_password?: boolean; locked?: boolean };
  if (!result?.ok || !result.scanner_id) {
    return fail(result?.error || "Identifiant ou mot de passe incorrect.", result?.locked ? 429 : 401, result?.locked ? { locked: true } : {});
  }

  // Le compte qui vient d'être vérifié (un seul compte par accès)
  const { data: account } = await supabase
    .from("merchant_logins")
    .select("id")
    .eq("scanner_access_id", result.scanner_id)
    .eq("login", login)
    .maybeSingle();
  if (!account) return fail("Erreur serveur, réessayez.", 500);

  await startManagerSession(result.scanner_id, account.id);
  return NextResponse.json({ ok: true, role: "gerant", mustChangePassword: !!result.must_change_password }, { headers: NO_STORE });
}
