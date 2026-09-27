import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Vérifie l'en-tête "Authorization: ApplePass <jeton>" envoyé par l'iPhone
 * et renvoie la carte correspondante (ou null).
 */
export async function authorizeApplePass(request: Request, passTypeId: string, serial: string) {
  if (passTypeId !== process.env.APPLE_PASS_TYPE_ID) return null;
  if (!/^[0-9a-f-]{36}$/i.test(serial)) return null;
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^ApplePass\s+/i, "").trim();
  if (!token) return null;

  const { data } = await createAdminClient()
    .from("cards")
    .select("id, auth_token, updated_at")
    .eq("serial_number", serial)
    .maybeSingle();
  if (!data || data.auth_token !== token) return null;
  return data as { id: string; auth_token: string; updated_at: string };
}
