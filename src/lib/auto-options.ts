import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Messages automatiques coupés commerce par commerce depuis le CRM (27 oct. 2026, demande d'Alexandre) :
 * table crm_reglages, clé « auto:<business_id> », valeur JSON { "winback": false, "avis": false }.
 * - winback : « Tu nous manques » (runWinback) ;
 * - avis : la demande d'avis Google automatique (runReviewRequestsWith).
 * Pas de ligne, ou pas de false pour l'option = elle reste active.
 * Réglages illisibles : null, et l'appelant n'envoie rien à ce passage (on réessaie au suivant, 5 minutes plus tard).
 */
export type AutoOption = "winback" | "avis";

export async function businessesWithAutoOff(db: SupabaseClient, option: AutoOption): Promise<Set<string> | null> {
  const { data, error } = await db.from("crm_reglages").select("cle, valeur").like("cle", "auto:%");
  if (error) {
    console.error("[auto-options]", error.message);
    return null;
  }
  const off = new Set<string>();
  for (const r of (data ?? []) as { cle: string; valeur: string | null }[]) {
    try {
      const v = JSON.parse(r.valeur ?? "{}") as Record<string, unknown> | null;
      if (v && v[option] === false) off.add(r.cle.slice("auto:".length));
    } catch {
      // valeur illisible : rien de coupé pour ce commerce
    }
  }
  return off;
}
