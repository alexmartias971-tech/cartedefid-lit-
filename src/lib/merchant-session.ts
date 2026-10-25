import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";
import { perRequest } from "@/lib/request-memo";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE = "commercant_session";
const DURATION_HOURS = 12;

function sign(payload: string) {
  return crypto.createHmac("sha256", requireEnv("MERCHANT_SESSION_SECRET")).update(payload).digest("base64url");
}

/**
 * Crée le "badge" de connexion du commerçant après un bon code PIN (valable 12 h).
 * issuedAt : moment d'émission (par défaut maintenant ; voir merchant-device.ts).
 */
export async function startMerchantSession(scannerId: string, issuedAt = Date.now()) {
  const expires = issuedAt + DURATION_HOURS * 3600 * 1000;
  const payload = `${scannerId}.${expires}`;
  const store = await cookies();
  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expires),
  });
}

export async function endMerchantSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export type MerchantSession = {
  scannerId: string;
  businessId: string;
  accessToken: string;
  canSendNotifications: boolean;
  label: string;
};

/**
 * Lit le badge SANS base de données : signature et date d'expiration.
 * Renvoie l'identifiant de l'accès si le badge est authentique et pas expiré, sinon null.
 */
export function readSessionCookie(raw: string | undefined | null): { scannerId: string; expires: number } | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [scannerId, expires, signature] = parts;
  const expected = sign(`${scannerId}.${expires}`);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  if (!(Number(expires) >= Date.now())) return null;
  return { scannerId, expires: Number(expires) };
}

/**
 * L'accès est-il toujours actif (et son commerce actif) ? Une seule lecture, colonnes utiles seulement.
 * En même temps (sans attente de plus) : « Déconnecter tous les appareils » (merchant_device_revocations) ;
 * un badge émis AVANT cette déconnexion générale est refusé tout de suite.
 */
async function loadSession(scannerId: string, issuedAt: number): Promise<MerchantSession | null> {
  const supabase = createAdminClient();
  const [{ data }, revoked] = await Promise.all([
    supabase
      .from("scanner_access")
      .select("id, business_id, access_token, is_active, can_send_notifications, label, businesses(status)")
      .eq("id", scannerId)
      .maybeSingle(),
    supabase.from("merchant_device_revocations").select("devices_revoked_at").eq("scanner_access_id", scannerId).maybeSingle(),
  ]);
  const business = data?.businesses as unknown as { status: string } | null;
  if (!data || !data.is_active || business?.status !== "active") return null;
  if (revoked.error) console.error("[session] déconnexion générale illisible :", revoked.error.message);
  const revokedAt = Date.parse((revoked.data as { devices_revoked_at?: string } | null)?.devices_revoked_at ?? "");
  if (Number.isFinite(revokedAt) && issuedAt <= revokedAt) return null;
  return {
    scannerId: data.id,
    businessId: data.business_id,
    accessToken: data.access_token,
    canSendNotifications: data.can_send_notifications,
    label: data.label,
  };
}

/**
 * Vérifie le badge du commerçant ET que son accès est toujours actif
 * (si tu désactives un accès dans ton tableau de bord, il est déconnecté aussitôt).
 * Une seule lecture de la base par demande, même si la fonction est appelée plusieurs fois (voir request-memo.ts).
 */
export async function getMerchantSession(): Promise<MerchantSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  const parsed = readSessionCookie(raw);
  if (!parsed) return null;
  // le badge dure 12 h : il a été émis 12 h avant son expiration
  return perRequest(store, `session:${raw}`, () => loadSession(parsed.scannerId, parsed.expires - DURATION_HOURS * 3600 * 1000));
}
