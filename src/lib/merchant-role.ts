import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";
import { getMerchantSession, readSessionCookie, type MerchantSession } from "@/lib/merchant-session";
import { perRequest } from "@/lib/request-memo";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Gérant ou employé ? (espace commerçant de walty.fr)
 *
 * Le badge de connexion « commercant_session » est le même pour le code PIN et pour le mot de passe :
 * il dit QUEL accès est connecté, pas COMMENT. Un accès (et son code PIN) peut être partagé par toute l'équipe.
 * La preuve « gérant » est donc un SECOND cookie, « commercant_role », posé uniquement par la connexion
 * e-mail/identifiant + mot de passe (adresse login-gerant) :
 *
 *   commercant_role = v1.<id du compte merchant_logins>.<signature>
 *   signature = HMAC-SHA256(MERCHANT_SESSION_SECRET, "walty-role-v1|gerant|<id du compte>|<valeur EXACTE du cookie commercant_session>")
 *
 * - Il ne vaut qu'avec LE badge de session posé en même temps (même valeur, donc même accès et même expiration, 12 h) :
 *   un nouveau code PIN tapé sur le même navigateur le rend inutile ; il expire avec la session.
 * - À chaque usage on vérifie aussi dans la base que ce compte existe toujours, est lié à CET accès,
 *   et que le mot de passe provisoire a été changé (sinon : pas encore gérant).
 * - Préfixe « walty-role-v1|… » : aucune confusion possible avec la signature du badge de session (« <uuid>.<date> »).
 *
 * Entrée Walty (26 oct. 2026) : Alexandre ouvre l'espace gérant de n'importe quel commerce depuis le CRM (ticket à usage unique,
 * /api/merchant/entree). Même cookie, autre forme : « a1.<id de l'accès>.<signature> », signature =
 * HMAC(MERCHANT_SESSION_SECRET, "walty-role-v1|admin|<id de l'accès>|<valeur EXACTE du cookie commercant_session>").
 * Liée au badge comme la preuve « gérant » ; elle donne les rubriques du gérant sans compte gérant (et sans mot de passe à changer).
 * Elle dure 2 h (ADMIN_HOURS) : une entrée oubliée sur l'ordinateur d'un commerçant ne reste pas ouverte une journée.
 */

const SESSION_COOKIE = "commercant_session";
export const ROLE_COOKIE = "commercant_role";
const DURATION_HOURS = 12;
const ADMIN_HOURS = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hmac = (payload: string) =>
  crypto.createHmac("sha256", requireEnv("MERCHANT_SESSION_SECRET")).update(payload).digest("base64url");
const roleSignature = (loginId: string, sessionValue: string) => hmac(`walty-role-v1|gerant|${loginId}|${sessionValue}`);
const adminSignature = (scannerId: string, sessionValue: string) => hmac(`walty-role-v1|admin|${scannerId}|${sessionValue}`);

function safeEqual(a: string, b: string) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Ouvre la session après un bon mot de passe : le badge habituel (même format que startMerchantSession)
 * ET le cookie « gérant » qui lui est lié.
 */
export async function startManagerSession(scannerId: string, loginId: string, issuedAt = Date.now()) {
  const expires = issuedAt + DURATION_HOURS * 3600 * 1000;
  const payload = `${scannerId}.${expires}`;
  const sessionValue = `${payload}.${hmac(payload)}`;
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expires),
  };
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionValue, options);
  store.set(ROLE_COOKIE, `v1.${loginId}.${roleSignature(loginId, sessionValue)}`, options);
}

/** Entrée Walty : le badge habituel sur cet accès ET la preuve « Walty » qui lui est liée (2 h). */
export async function startAdminSession(scannerId: string, issuedAt = Date.now()) {
  const expires = issuedAt + ADMIN_HOURS * 3600 * 1000;
  const payload = `${scannerId}.${expires}`;
  const sessionValue = `${payload}.${hmac(payload)}`;
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expires),
  };
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionValue, options);
  store.set(ROLE_COOKIE, `a1.${scannerId}.${adminSignature(scannerId, sessionValue)}`, options);
}

export type MerchantRole = {
  session: MerchantSession;
  /** Connecté par e-mail/identifiant + mot de passe (preuve valable pour cette session). */
  password: boolean;
  /** Mot de passe provisoire pas encore changé. */
  mustChange: boolean;
  /** Gérant = connecté par mot de passe ET mot de passe provisoire changé (ou entrée Walty). */
  manager: boolean;
  /** Entrée Walty : Alexandre, depuis le CRM (rubriques du gérant, pas de mot de passe à changer). */
  admin?: boolean;
};

/**
 * La session (comme getMerchantSession) et le rôle prouvé. null si pas de session.
 * Rapide : la signature du cookie « gérant » est vérifiée sans base de données, puis l'accès (scanner_access) et
 * le compte gérant (merchant_logins) sont lus EN MÊME TEMPS ; une seule fois par demande (voir request-memo.ts).
 */
export async function getMerchantRole(): Promise<MerchantRole | null> {
  const store = await cookies();
  const sessionValue = store.get(SESSION_COOKIE)?.value ?? "";
  const raw = store.get(ROLE_COOKIE)?.value ?? "";
  return perRequest(store, `role:${sessionValue}|${raw}`, async () => {
    // Preuve « gérant » valable pour CE badge ? (calcul local, sans base de données)
    const parts = raw.split(".");
    const loginId = parts.length === 3 && parts[0] === "v1" && UUID.test(parts[1]) && sessionValue ? parts[1] : "";
    const signed = !!loginId && safeEqual(parts[2], roleSignature(loginId, sessionValue));
    const scannerId = readSessionCookie(sessionValue)?.scannerId ?? "";
    // Entrée Walty : preuve liée à CE badge et à CET accès (calcul local)
    const admin =
      parts.length === 3 && parts[0] === "a1" && parts[1] === scannerId && UUID.test(scannerId) && !!sessionValue &&
      safeEqual(parts[2], adminSignature(scannerId, sessionValue));

    const [session, account] = await Promise.all([
      getMerchantSession(),
      signed && UUID.test(scannerId)
        ? createAdminClient()
            .from("merchant_logins")
            .select("id, must_change_password")
            .eq("id", loginId)
            .eq("scanner_access_id", scannerId)
            .maybeSingle()
            .then((r) => r.data as { id: string; must_change_password: boolean } | null)
        : Promise.resolve(null),
    ]);
    if (!session) return null;
    if (admin && session.scannerId === scannerId) return { session, password: false, mustChange: false, manager: true, admin: true };
    if (!account || session.scannerId !== scannerId) return { session, password: false, mustChange: false, manager: false };
    const mustChange = !!account.must_change_password;
    return { session, password: true, mustChange, manager: !mustChange };
  });
}
