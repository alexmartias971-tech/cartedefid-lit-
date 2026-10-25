import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";
import { startManagerSession } from "@/lib/merchant-role";
import { startMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * « Appareil mémorisé 90 jours » (application Walty Caisse, espace commerçant de walty.fr).
 *
 * Après une bonne connexion (code PIN ou e-mail/identifiant + mot de passe), l'appareil reçoit un TROISIÈME cookie,
 * « commercant_appareil », valable 90 jours. Quand le badge de session (12 h) a expiré, la passerelle de walty.fr
 * demande ici (adresse « device ») un nouveau badge à partir de ce cookie : le commerçant ne retape rien.
 *
 *   commercant_appareil = d1.<accès>.<compte gérant ou 0>.<appareil>.<émis le>.<expire le>.<empreinte>.<signature>
 *   signature = HMAC-SHA256(MERCHANT_SESSION_SECRET, "walty-device-v1|<accès>|<compte>|<appareil>|<émis>|<expire>|<empreinte>")
 *
 * - accès : scanner_access.id ; compte : merchant_logins.id pour un gérant (connexion par mot de passe), « 0 » pour
 *   une connexion par code PIN (employé) ; appareil : 16 octets aléatoires propres à cet appareil.
 * - empreinte : HMAC (avec le même secret) d'une empreinte du code PIN (employé) ou du mot de passe (gérant) tel qu'il
 *   est enregistré dans la base AU MOMENT de la connexion. Code PIN changé (employé) ou mot de passe changé (gérant)
 *   => l'empreinte ne correspond plus => l'appareil doit se reconnecter. Rien du code PIN ni du mot de passe n'est
 *   lisible dans le cookie.
 * - Le renouvellement vérifie TOUJOURS dans la base (une seule fonction, merchant_device_state) : accès actif,
 *   commerce actif, compte gérant toujours lié à cet accès, empreinte, et « Déconnecter tous les appareils »
 *   (merchant_device_revocations.devices_revoked_at : tout cookie émis AVANT est refusé ; les badges de session
 *   émis avant sont aussi refusés tout de suite, voir loadSession dans merchant-session.ts).
 * - Préfixe « walty-device-v1|… » : aucune confusion possible avec les signatures du badge de session ni du rôle.
 * - « Quitter » efface ce cookie (l'appareil est oublié).
 */

export const DEVICE_COOKIE = "commercant_appareil";
export const DEVICE_DAYS = 90;
const DAY_MS = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64 = /^[A-Za-z0-9_-]+$/;

const hmac = (payload: string) =>
  crypto.createHmac("sha256", requireEnv("MERCHANT_SESSION_SECRET")).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export type DeviceCookie = {
  scannerId: string;
  /** Compte gérant (connexion par mot de passe) ou null (code PIN). */
  loginId: string | null;
  deviceId: string;
  issuedAt: number;
  expiresAt: number;
  fp: string;
};

/** État de l'accès dans la base (fonction merchant_device_state, réservée au serveur). */
export type DeviceState = {
  found: boolean;
  active: boolean;
  revoked_at: string | null;
  pin_fp: string | null;
  login_ok: boolean;
  pwd_fp: string | null;
};

const signDevice = (d: Omit<DeviceCookie, never>) =>
  hmac(`walty-device-v1|${d.scannerId}|${d.loginId ?? "0"}|${d.deviceId}|${d.issuedAt}|${d.expiresAt}|${d.fp}`);

/** Empreinte des identifiants actuels (code PIN pour un employé, mot de passe pour un gérant). */
export function credentialFingerprint(state: DeviceState, loginId: string | null): string | null {
  const source = loginId ? state.pwd_fp : state.pin_fp;
  if (!source) return null;
  return hmac(`walty-device-fp-v1|${loginId ? "gerant" : "employe"}|${source}`).slice(0, 22);
}

/** Lit le cookie SANS base de données : signature et date d'expiration. null s'il est faux, abîmé ou expiré. */
export function readDeviceCookie(raw: string | undefined | null, now = Date.now()): DeviceCookie | null {
  if (!raw || raw.length > 300) return null;
  const parts = raw.split(".");
  if (parts.length !== 8 || parts[0] !== "d1") return null;
  const [, scannerId, login, deviceId, issued, expires, fp, signature] = parts;
  if (!UUID.test(scannerId) || !(login === "0" || UUID.test(login))) return null;
  if (!B64.test(deviceId) || !B64.test(fp) || !B64.test(signature)) return null;
  const d: DeviceCookie = {
    scannerId: scannerId.toLowerCase(),
    loginId: login === "0" ? null : login.toLowerCase(),
    deviceId,
    issuedAt: Number(issued),
    expiresAt: Number(expires),
    fp,
  };
  if (!Number.isFinite(d.issuedAt) || !Number.isFinite(d.expiresAt)) return null;
  // la signature porte sur les valeurs telles qu'elles ont été émises (minuscules)
  if (d.scannerId !== scannerId || (d.loginId && d.loginId !== login)) return null;
  if (!safeEqual(signature, signDevice(d))) return null;
  if (!(d.expiresAt > now) || d.issuedAt > now + 5 * 60000 || d.expiresAt - d.issuedAt > (DEVICE_DAYS + 1) * DAY_MS) return null;
  return d;
}

/** Une seule lecture de la base : l'accès, son commerce, la déconnexion générale, les empreintes. */
export async function loadDeviceState(scannerId: string, loginId: string | null): Promise<DeviceState | null> {
  const { data, error } = await createAdminClient().rpc("merchant_device_state", { p_scanner_id: scannerId, p_login_id: loginId });
  if (error || !data) {
    if (error) console.error("[appareil]", error.message);
    return null;
  }
  return data as DeviceState;
}

function setDeviceCookie(store: Awaited<ReturnType<typeof cookies>>, d: DeviceCookie) {
  store.set(DEVICE_COOKIE, ["d1", d.scannerId, d.loginId ?? "0", d.deviceId, d.issuedAt, d.expiresAt, d.fp, signDevice(d)].join("."), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(d.expiresAt),
  });
}

/**
 * Juste après une bonne connexion : mémorise CET appareil 90 jours.
 * Sans réponse de la base (rare), on n'empêche pas la connexion : l'appareil n'est simplement pas mémorisé.
 */
export async function rememberDevice(scannerId: string, loginId: string | null, issuedAt = Date.now()): Promise<boolean> {
  const state = await loadDeviceState(scannerId, loginId);
  const fp = state && state.active && (!loginId || state.login_ok) ? credentialFingerprint(state, loginId) : null;
  if (!fp) return false;
  const store = await cookies();
  setDeviceCookie(store, {
    scannerId,
    loginId,
    deviceId: crypto.randomBytes(16).toString("base64url"),
    issuedAt,
    expiresAt: issuedAt + DEVICE_DAYS * DAY_MS,
    fp,
  });
  return true;
}

/** « Quitter » : cet appareil est oublié. */
export async function forgetDevice() {
  const store = await cookies();
  store.delete(DEVICE_COOKIE);
}

/** Le cookie de l'appareil (vérifié sans base de données), ou null. */
export async function currentDevice(): Promise<DeviceCookie | null> {
  const store = await cookies();
  return readDeviceCookie(store.get(DEVICE_COOKIE)?.value);
}

const revokedAfter = (state: DeviceState, issuedAt: number) => {
  const t = state.revoked_at ? Date.parse(state.revoked_at) : NaN;
  return Number.isFinite(t) && issuedAt <= t;
};

export type RenewResult =
  | { ok: true; role: "gerant" | "employe" }
  | { ok: false; reason: "absent" | "invalide" | "desactive" | "deconnecte" | "identifiants" | "erreur" };

/**
 * Le badge de session a expiré : un nouveau badge (12 h) à partir du cookie de l'appareil, après vérification dans
 * la base. Refus => le cookie de l'appareil est effacé (sauf panne de la base : on réessaiera).
 */
export async function renewFromDevice(): Promise<RenewResult> {
  const store = await cookies();
  const raw = store.get(DEVICE_COOKIE)?.value;
  if (!raw) return { ok: false, reason: "absent" };
  const device = readDeviceCookie(raw);
  const refuse = (reason: Exclude<RenewResult, { ok: true }>["reason"]): RenewResult => {
    store.delete(DEVICE_COOKIE);
    return { ok: false, reason };
  };
  if (!device) return refuse("invalide");
  const state = await loadDeviceState(device.scannerId, device.loginId);
  if (!state) return { ok: false, reason: "erreur" };
  if (!state.found || !state.active) return refuse("desactive");
  if (revokedAfter(state, device.issuedAt)) return refuse("deconnecte");
  if (device.loginId && !state.login_ok) return refuse("identifiants");
  const fp = credentialFingerprint(state, device.loginId);
  if (!fp || !safeEqual(fp, device.fp)) return refuse("identifiants");

  if (device.loginId) {
    await startManagerSession(device.scannerId, device.loginId);
    return { ok: true, role: "gerant" };
  }
  await startMerchantSession(device.scannerId);
  return { ok: true, role: "employe" };
}

/**
 * Après un changement de mot de passe sur CET appareil (appelé par la route « password », juste après le changement
 * réussi avec l'ancien mot de passe) : son cookie (même appareil, même date de fin) reçoit l'empreinte du nouveau
 * mot de passe, sinon il serait refusé au prochain renouvellement. Seulement si la session actuelle est bien celle de
 * ce cookie (même accès, même compte gérant). Jamais sur simple demande du navigateur.
 */
export async function refreshDeviceFingerprint(scannerId: string, loginId: string | null): Promise<boolean> {
  if (!loginId) return false;
  const store = await cookies();
  const device = readDeviceCookie(store.get(DEVICE_COOKIE)?.value);
  if (!device || device.scannerId !== scannerId || device.loginId !== loginId) return false;
  const state = await loadDeviceState(scannerId, loginId);
  if (!state || !state.active || (loginId && !state.login_ok) || revokedAfter(state, device.issuedAt)) return false;
  const fp = credentialFingerprint(state, loginId);
  if (!fp) return false;
  setDeviceCookie(store, { ...device, fp });
  return true;
}

/**
 * « Déconnecter tous les appareils » (gérant) : tous les appareils et toutes les sessions de cet accès sont refusés,
 * puis CET appareil (celui du gérant qui vient de le demander) reçoit aussitôt un nouveau badge, une nouvelle preuve
 * « gérant » et un nouveau cookie d'appareil, émis APRÈS la déconnexion générale : il reste connecté.
 */
export async function revokeAllDevices(scannerId: string, loginId: string): Promise<{ ok: boolean; revokedAt?: string }> {
  const { data, error } = await createAdminClient().rpc("merchant_revoke_devices", { p_scanner_id: scannerId, p_login_id: loginId });
  if (error || !data) {
    if (error) console.error("[appareils]", error.message);
    return { ok: false };
  }
  const revokedAt = String(data);
  const t = Date.parse(revokedAt);
  // un instant APRÈS la déconnexion générale (millisecondes ; la base est à la microseconde)
  const issuedAt = Math.max(Date.now(), Number.isFinite(t) ? Math.floor(t) + 1 : 0);
  await startManagerSession(scannerId, loginId, issuedAt);
  await rememberDevice(scannerId, loginId, issuedAt);
  return { ok: true, revokedAt };
}

/** Compte gérant de la preuve « gérant » actuelle (à n'utiliser qu'APRÈS getMerchantRole() : password === true). */
export async function currentLoginId(): Promise<string | null> {
  const store = await cookies();
  const parts = (store.get("commercant_role")?.value ?? "").split(".");
  return parts.length === 3 && parts[0] === "v1" && UUID.test(parts[1]) ? parts[1].toLowerCase() : null;
}
