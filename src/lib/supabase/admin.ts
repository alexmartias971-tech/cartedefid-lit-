import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * ⚠️ Connexion avec la CLÉ SECRÈTE : elle ignore la sécurité RLS.
 * Utilisée uniquement côté serveur (inscription client, espace commerçant, Wallet),
 * toujours après avoir vérifié qui fait la demande.
 */
export function createAdminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
