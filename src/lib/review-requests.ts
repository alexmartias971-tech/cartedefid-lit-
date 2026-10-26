import "server-only";
import { loadCardBundlesByIds } from "@/lib/cards";
import { GOOGLE_MAX_PER_24H } from "@/lib/notifications";
import { runReviewRequestsWith, type ReviewRunReport } from "@/lib/review-requests-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCard } from "@/lib/wallet-sync";

/**
 * Demande d'avis Google automatique (règles et explications : review-requests-core.ts).
 * Appelée par la tâche planifiée /api/cron/notifications toutes les 5 minutes. Ne lève jamais d'erreur :
 * le compte rendu (des nombres, aucun nom ni numéro de carte) est noté dans les logs et renvoyé.
 */
export async function runReviewRequests(): Promise<ReviewRunReport | { error: string }> {
  try {
    const report = await runReviewRequestsWith({
      db: createAdminClient(),
      loadBundles: loadCardBundlesByIds,
      send: syncCard,
      googleMaxPer24h: GOOGLE_MAX_PER_24H,
    });
    if (report.aborted) console.error("[avis Google] arrêt :", report.aborted);
    else if (!report.quiet && (report.candidates > 0 || report.sent > 0 || report.failed > 0)) {
      console.info("[avis Google]", JSON.stringify(report));
    }
    return report;
  } catch (err) {
    console.error("[avis Google]", (err as Error).message);
    return { error: "Erreur pendant les demandes d'avis" };
  }
}
