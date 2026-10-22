import { NextResponse } from "next/server";
import { getMerchantRole } from "@/lib/merchant-role";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Le commerçant connecté change son mot de passe (espace commerçant de walty.fr) :
 * à la première connexion (mot de passe provisoire donné par Walty) ou quand il veut.
 * Il faut une session ouverte ET le mot de passe actuel (5 erreurs => blocage 15 minutes).
 * Le nouveau mot de passe : 8 caractères au moins. Rien n'est écrit dans les journaux.
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
  // Seulement depuis une connexion par e-mail/identifiant + mot de passe (même provisoire), jamais depuis un code PIN :
  // vérifié ici (la passerelle walty.fr ne le redemande plus).
  if (!role.password) {
    return fail("Le mot de passe se change depuis une connexion par e-mail et mot de passe.", 403, { forbidden: true });
  }
  const session = role.session;

  const raw = await request.text().catch(() => "");
  if (raw.length > 2000) return fail("Demande trop longue.", 413);
  let body: { old?: unknown; new?: unknown } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const oldPassword = typeof body.old === "string" ? body.old : "";
  const newPassword = typeof body.new === "string" ? body.new : "";
  if (!oldPassword) return fail("Indiquez votre mot de passe actuel.", 400);
  if (newPassword.length < 8) return fail("Le nouveau mot de passe doit faire au moins 8 caractères.", 400);
  if (oldPassword.length > 200 || newPassword.length > 72) return fail("Le mot de passe est trop long (72 caractères au plus).", 400);

  const { data, error } = await createAdminClient().rpc("set_merchant_password", {
    p_scanner_id: session.scannerId,
    p_old: oldPassword,
    p_new: newPassword,
  });
  if (error) return fail("Erreur serveur, réessayez.", 500);
  const result = data as { ok: boolean; error?: string; no_account?: boolean };
  if (!result?.ok) {
    return fail(result?.error || "Mot de passe non modifié.", result?.no_account ? 404 : 400, result?.no_account ? { noAccount: true } : {});
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
