import { NextResponse } from "next/server";
import { startMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lien reçu par e-mail (« Mot de passe oublié ? ») : le commerçant choisit son nouveau mot de passe.
 * - Le jeton (valable 1 heure, une seule fois) est vérifié dans la base (complete_merchant_reset) par son empreinte SHA-256.
 * - Nouveau mot de passe : 8 caractères au moins ; le compte est débloqué ; il n'est plus « provisoire ».
 * - Si l'accès et le commerce sont actifs, le commerçant est connecté tout de suite (même session que le code PIN).
 * - Ni le jeton ni le mot de passe ne sont écrits dans les journaux ni renvoyés.
 */
const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...extra }, { status, headers: NO_STORE });
const INVALID = "Ce lien n'est plus valable (il sert une seule fois, pendant 1 heure). Demandez-en un nouveau.";

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
  let body: { token?: unknown; password?: unknown } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return fail(INVALID, 400, { invalid: true });
  if (password.length < 8) return fail("Le nouveau mot de passe doit faire au moins 8 caractères.", 400);
  if (password.length > 72) return fail("Le nouveau mot de passe est trop long (72 caractères au plus).", 400);

  const { data, error } = await createAdminClient().rpc("complete_merchant_reset", { p_token: token, p_new_password: password });
  if (error) return fail("Erreur serveur, réessayez.", 500);
  const result = data as { ok: boolean; error?: string; invalid?: boolean; login?: string; scanner_id?: string } | null;
  if (!result?.ok) {
    return fail(result?.error || INVALID, 400, result?.invalid ? { invalid: true } : {});
  }
  if (result.scanner_id) await startMerchantSession(result.scanner_id);
  return NextResponse.json({ ok: true, loggedIn: !!result.scanner_id, login: result.login || "" }, { headers: NO_STORE });
}
