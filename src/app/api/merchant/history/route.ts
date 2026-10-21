import { after } from "next/server";
import { getMerchantSession } from "@/lib/merchant-session";
import {
  EVENT_SELECT,
  expired,
  gpDay,
  gpDayBounds,
  json,
  mapEvent,
  REWARD_TYPES,
  undoableIds,
  UUID,
  VISIT_TYPES,
  type EventRow,
} from "@/lib/merchant-space";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCard } from "@/lib/wallet-sync";
import { getMerchantRole } from "@/lib/merchant-role";

const FILTERS: Record<string, readonly string[] | null> = {
  all: null,
  visits: VISIT_TYPES,
  rewards: REWARD_TYPES,
  bonus: ["correction"],
};

/**
 * Historique des passages d'une journée (heure de Guadeloupe), pour l'espace commerçant de walty.fr.
 * ?day=AAAA-MM-JJ (aujourd'hui par défaut) · ?type=all|visits|rewards|bonus|undone · ?limit=…
 * Renvoie aussi le résumé de la journée (passages, récompenses, nouveaux clients, achats)
 * et, pour chaque ligne, si cet accès peut encore l'annuler (10 minutes, comme au scanner).
 */
export async function GET(request: Request) {
  const session = await getMerchantSession();
  if (!session) return expired();
  // réservé au gérant (connexion e-mail + mot de passe), comme dans la passerelle walty.fr
  if (!(await getMerchantRole())?.manager) {
    return Response.json({ ok: false, error: "Réservé au gérant : connectez-vous avec votre e-mail et votre mot de passe." }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const today = gpDay(Date.now());
  const day = params.get("day") || today;
  const bounds = gpDayBounds(day);
  if (!bounds || day > today) return json({ ok: false, error: "Date invalide." }, 400);
  const type = params.get("type") ?? "all";
  if (!(type in FILTERS) && type !== "undone") return json({ ok: false, error: "Filtre inconnu." }, 400);
  const limit = Math.min(300, Math.max(1, Number.parseInt(params.get("limit") ?? "200", 10) || 200));

  const supabase = createAdminClient();
  const [{ data, error }, newCustomers] = await Promise.all([
    supabase
      .from("stamp_events")
      .select(EVENT_SELECT)
      .eq("business_id", session.businessId)
      .gte("created_at", bounds.start)
      .lt("created_at", bounds.end)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", session.businessId)
      .gte("created_at", bounds.start)
      .lt("created_at", bounds.end),
  ]);
  if (error) {
    console.error("[espace history]", error.message);
    return json({ ok: false, error: "Impossible de charger l'historique. Réessayez." }, 500);
  }
  const events = (data ?? []) as unknown as EventRow[];

  const isVisit = (e: EventRow) => (VISIT_TYPES as readonly string[]).includes(e.event_type);
  const isReward = (e: EventRow) => (REWARD_TYPES as readonly string[]).includes(e.event_type);
  const live = events.filter((e) => !e.undone_at);
  const summary = {
    visits: live.filter(isVisit).length,
    rewards: live.filter(isReward).length,
    undone: events.filter((e) => e.undone_at).length,
    sales: Math.round(live.filter((e) => e.event_type === "purchase").reduce((s, e) => s + Number(e.amount ?? 0), 0) * 100) / 100,
    newCustomers: newCustomers.count ?? 0,
    customers: new Set(live.filter(isVisit).map((e) => e.card_id)).size,
  };

  const allowed = FILTERS[type];
  const filtered = type === "undone" ? events.filter((e) => e.undone_at) : allowed ? events.filter((e) => allowed.includes(e.event_type)) : events;
  const canUndo = day === today ? undoableIds(events, session.scannerId) : new Set<string>();

  return json({
    ok: true,
    day,
    today,
    summary,
    events: filtered.slice(0, limit).map((e) => mapEvent(e, canUndo.has(e.id))),
    more: filtered.length > limit,
  });
}

/** Annuler un passage depuis l'historique : mêmes règles qu'au scanner (le dernier de la carte, par cet accès, 10 minutes). */
export async function POST(request: Request) {
  const session = await getMerchantSession();
  if (!session) return expired();
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return json({ ok: false, error: "Demande invalide." }, 415);
  }
  const body = (await request.json().catch(() => ({}))) as { action?: string; event_id?: string };
  if (body.action !== "undo" || !UUID.test(body.event_id ?? "")) return json({ ok: false, error: "Demande invalide." }, 400);

  const supabase = createAdminClient();
  const { data: ev } = await supabase
    .from("stamp_events")
    .select("id, card_id, business_id, scanner_id, event_type, undone_at, created_at")
    .eq("id", body.event_id!)
    .eq("business_id", session.businessId)
    .maybeSingle();
  if (!ev) return json({ ok: false, error: "Passage introuvable." }, 404);
  if (ev.undone_at) return json({ ok: false, error: "Ce passage est déjà annulé." }, 409);
  if (!(VISIT_TYPES as readonly string[]).includes(ev.event_type)) {
    return json({ ok: false, error: "Seuls les tampons et les achats peuvent être annulés. Pour le reste, contactez Walty." }, 409);
  }
  if (ev.scanner_id !== session.scannerId) {
    return json({ ok: false, error: "Ce passage a été fait avec un autre accès : il ne peut être annulé que depuis cet accès." }, 409);
  }
  if (Date.parse(ev.created_at) < Date.now() - 10 * 60000) {
    return json({ ok: false, error: "Trop tard : un passage s'annule dans les 10 minutes. Contactez Walty si besoin." }, 409);
  }
  // La base annule le DERNIER tampon / achat de cette carte fait par cet accès : on vérifie que c'est bien celui-ci
  const { data: last } = await supabase
    .from("stamp_events")
    .select("id")
    .eq("card_id", ev.card_id)
    .eq("scanner_id", session.scannerId)
    .in("event_type", [...VISIT_TYPES])
    .is("undone_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last || last.id !== ev.id) {
    return json({ ok: false, error: "Annulez d'abord le passage plus récent de ce client." }, 409);
  }
  const { data: card } = await supabase
    .from("cards")
    .select("id, serial_number, loyalty_programs!inner(business_id)")
    .eq("id", ev.card_id)
    .eq("loyalty_programs.business_id", session.businessId)
    .maybeSingle();
  if (!card) return json({ ok: false, error: "Carte introuvable." }, 404);

  const { data, error } = await supabase.rpc("undo_last_action", { p_serial: card.serial_number, p_scanner_id: session.scannerId });
  if (error) {
    console.error("[espace history undo]", error.message);
    return json({ ok: false, error: "Erreur serveur, réessayez." }, 500);
  }
  const result = data as { ok: boolean; error?: string };
  if (!result.ok) return json({ ok: false, error: result.error ?? "Annulation impossible." }, 409);
  // La carte du client se met à jour dans son téléphone
  after(() => syncCard(card.id));
  return json({ ok: true, done: "Passage annulé ✓ La carte du client est corrigée." });
}
