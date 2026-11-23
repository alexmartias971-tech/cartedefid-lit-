import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { normalizePhone, phoneVariants } from "@/lib/format";

/**
 * Qui peut voir une carte ? (22 nov. 2026 : un lien de carte partagé montrait le nom de son propriétaire.)
 * Le lien seul ne suffit plus : le téléphone doit avoir le cookie de CETTE carte (posé à l'inscription, ou après avoir
 * redonné le numéro ou l'e-mail de la carte).
 */
export const cookieCarte = (businessId: string) => `walty_carte_${businessId.replace(/-/g, "").slice(0, 12)}`;

export async function estMaCarte(businessId: string, token: string): Promise<boolean> {
  const v = (await cookies()).get(cookieCarte(businessId))?.value ?? "";
  return v.length === token.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(token));
}

export async function retenirCarte(businessId: string, token: string) {
  (await cookies()).set(cookieCarte(businessId), token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 400 * 86400 });
}

/**
 * Gmail ignore les points et ce qui suit « + » : « jean.dupont+2@gmail.com » arrive chez « jeandupont@gmail.com ».
 * L'adresse est enregistrée sous cette forme, pour qu'une variante ne crée pas une 2e carte (et un 2e cadeau de bienvenue).
 */
export function emailUnique(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (domain === "gmail.com" || domain === "googlemail.com") return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
  return email;
}

/** Le numéro ou l'e-mail tapé est-il celui de la carte ? */
export function memeContact(tape: string, phone: string | null, email: string | null): boolean {
  const t = tape.trim().toLowerCase();
  if (t.includes("@")) return !!email && (email === t || email === emailUnique(t));
  const chiffres = t.replace(/\D/g, "");
  return !!phone && chiffres.length >= 9 && phoneVariants(normalizePhone(t)).includes(phone);
}
