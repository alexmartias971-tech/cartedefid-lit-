import { after, NextResponse } from "next/server";
import { loadCardBundlesByIds } from "@/lib/cards";
import { isGoogleConfigured } from "@/lib/env";
import { upsertGoogleClass } from "@/lib/google/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Program } from "@/lib/types";
import { syncCards } from "@/lib/wallet-sync";

export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Remet à jour dans les Wallet toutes les cartes d'un programme (même chose que resyncProgram du tableau de bord). */
async function resync(program: Program, business: Business) {
  const supabase = createAdminClient();
  if (isGoogleConfigured()) {
    try {
      await upsertGoogleClass(program, business);
    } catch (err) {
      console.error("[sync google class]", (err as Error).message);
    }
  }
  const { data } = await supabase
    .from("cards")
    .update({ updated_at: new Date().toISOString() })
    .eq("program_id", program.id)
    .select("id");
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    await syncCards(await loadCardBundlesByIds(ids.slice(i, i + 200)));
  }
}

/**
 * Le CRM Walty demande la mise à jour des cartes déjà installées d'un programme (après avoir déplacé la bande de tampons).
 * Corps : { "program_id": "<uuid>" }. Protégée par CRON_SECRET, comme /api/cron/notifications (en-tête Authorization: Bearer …).
 * Répond tout de suite ; la mise à jour des téléphones continue en arrière-plan.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorisé", { status: 401 });
  }
  let programId = "";
  try {
    const body = (await request.json()) as { program_id?: unknown };
    programId = String(body?.program_id ?? "");
  } catch {
    // corps illisible : refusé juste en dessous
  }
  if (!UUID.test(programId)) return NextResponse.json({ error: "program_id manquant" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: program } = await supabase.from("loyalty_programs").select("*").eq("id", programId).maybeSingle();
  // (422 et pas 404 : pour le CRM, 404 veut dire « cette route n'est pas encore en ligne »)
  if (!program) return NextResponse.json({ error: "Carte introuvable" }, { status: 422 });
  const { data: business } = await supabase.from("businesses").select("*").eq("id", (program as Program).business_id).maybeSingle();
  if (!business) return NextResponse.json({ error: "Commerce introuvable" }, { status: 422 });
  const { count } = await supabase.from("cards").select("id", { count: "exact", head: true }).eq("program_id", programId);

  after(() => resync(program as Program, business as Business));
  return NextResponse.json({ ok: true, cartes: count ?? 0 });
}
