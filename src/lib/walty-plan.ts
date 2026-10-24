import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Formule Walty du commerce (offre du 20 octobre 2026), table public.walty_plans (remplie depuis le CRM) :
 * - « tout-compris » (15 €/mois) : tout l'espace commerçant ;
 * - « essentiel » : la carte, le scanner, les clients, l'historique, Mon programme (sans parrainage
 *   ni lien d'avis Google), SANS chiffres détaillés, messages ni offres ; 1 accès d'équipe prévu.
 * Pas de ligne pour le commerce = « tout-compris » (les commerces d'avant l'offre gardent tout).
 * Lecture avec la clé serveur (service role) : la table est fermée au public (RLS, admin via crm_is_admin()).
 */
export type PlanId = "essentiel" | "tout-compris";
export type WaltyPlan = { plan: PlanId; trialEnd: string | null };

export const PLAN_UPGRADE_MESSAGE =
  "Disponible avec la formule Tout compris (15 €/mois). Pour en profiter, appelez Walty au 0690 51 36 46.";

export async function getWaltyPlan(businessId: string): Promise<WaltyPlan> {
  const { data, error } = await createAdminClient()
    .from("walty_plans")
    .select("plan, essai_fin")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    // Table illisible : on ne coupe rien au commerçant (comportement d'avant les formules)
    console.error("[walty plan]", error.message);
    return { plan: "tout-compris", trialEnd: null };
  }
  return { plan: data?.plan === "essentiel" ? "essentiel" : "tout-compris", trialEnd: data?.essai_fin ?? null };
}

export async function isEssentiel(businessId: string) {
  return (await getWaltyPlan(businessId)).plan === "essentiel";
}

/** Réponse 403 claire pour une fonction réservée à la formule Tout compris. */
export function planRefused() {
  return NextResponse.json(
    { ok: false, plan: "essentiel", upgrade: true, error: PLAN_UPGRADE_MESSAGE },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
