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

/** Prénom sans accents, majuscules, espaces ni tirets : « Jean-Éric » → « jeaneric ». */
export const simple = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Nombre de lettres à changer pour passer d'un mot à l'autre (Levenshtein ; les prénoms sont courts). */
function ecart(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Le prénom tapé est-il celui de l'inscription ? « Alex » retrouve « Alexandre » (début), et une faute de frappe est
 * tolérée, deux pour un prénom de 6 lettres ou plus : « Alexandre » retrouve « Alecandre ».
 */
export function memePrenom(tape: string, connu: string): boolean {
  if (!tape || !connu) return false;
  if (tape === connu) return true;
  if (tape.length >= 3 && connu.length >= 3 && (connu.startsWith(tape) || tape.startsWith(connu))) return true;
  const court = Math.min(tape.length, connu.length);
  return court >= 3 && ecart(tape, connu) <= (court >= 6 ? 2 : 1);
}
