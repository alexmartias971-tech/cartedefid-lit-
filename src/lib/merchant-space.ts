import "server-only";
import { NextResponse } from "next/server";
import { loadCardBundlesByIds } from "@/lib/cards";
import { isGoogleConfigured } from "@/lib/env";
import { upsertGoogleClass } from "@/lib/google/wallet";
import { getMerchantRole, type MerchantRole } from "@/lib/merchant-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Program } from "@/lib/types";
import { syncCards } from "@/lib/wallet-sync";

/**
 * Outils communs aux adresses de l'espace commerçant de walty.fr (walty.fr/espace) :
 * carte, programme, historique, fiche client, chiffres détaillés.
 * Les textes sont au vouvoiement (le commerçant est vouvoyé sur walty.fr).
 */

export const NO_STORE = { "Cache-Control": "no-store" } as const;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DAY_MS = 86400000;
/** Guadeloupe = UTC-4 toute l'année (pas d'heure d'été). */
export const GP_OFFSET_MS = 4 * 3600 * 1000;

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export const expired = () => json({ ok: false, error: "Session expirée : retapez votre code PIN." }, 401);

export const MANAGER_ONLY_MESSAGE = "Réservé au gérant : connectez-vous avec votre e-mail et votre mot de passe.";
/** 403 « réservé au gérant » (même forme que l'ancienne réponse de la passerelle walty.fr). */
export const forbidden = (error = MANAGER_ONLY_MESSAGE) => json({ ok: false, forbidden: true, error }, 403);

/**
 * Rubriques du gérant : le logiciel de cartes vérifie LUI-MÊME le rôle (la passerelle walty.fr ne le redemande plus).
 * Renvoie le rôle si c'est le gérant (connexion par mot de passe, mot de passe provisoire changé),
 * sinon la réponse à renvoyer telle quelle (401 session expirée, 403 employé).
 */
export async function requireManager(): Promise<{ role: MerchantRole; res: null } | { role: null; res: NextResponse }> {
  const role = await getMerchantRole();
  if (!role) return { role: null, res: json({ ok: false, error: "Session expirée : reconnectez-vous." }, 401) };
  if (!role.manager) return { role: null, res: forbidden() };
  return { role, res: null };
}

/** "2026-10-15" : le jour en heure de Guadeloupe. */
export const gpDay = (t: number) => new Date(t - GP_OFFSET_MS).toISOString().slice(0, 10);

/** Début et fin (exclue) d'une journée en heure de Guadeloupe. null si la date est mal formée. */
export function gpDayBounds(day: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = Date.parse(`${day}T00:00:00-04:00`);
  if (Number.isNaN(start)) return null;
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS).toISOString() };
}

export const VISIT_TYPES = ["stamp", "purchase"] as const;
export const REWARD_TYPES = ["reward_redeemed", "points_redeemed", "coupon_used", "cashback_used"] as const;

const LABELS: Record<string, string> = {
  stamp: "Tampon",
  purchase: "Achat",
  reward_redeemed: "Cadeau remis",
  points_redeemed: "Points échangés",
  cashback_used: "Cagnotte utilisée",
  coupon_used: "Offre utilisée",
  correction: "Bonus",
  stamp_removed: "Tampon retiré",
};
/** Corrections du gérant : « Retirer un tampon » (raison obligatoire, dans note). */
export const REMOVED_TYPES = ["stamp_removed"] as const;

const euro = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

export type EventRow = {
  id: string;
  created_at: string;
  event_type: string;
  delta: number;
  amount: number | null;
  points: number | null;
  cashback: number | null;
  note: string | null;
  undone_at: string | null;
  scanner_id: string | null;
  card_id: string;
  cards?: { customer_id: string; customers: { first_name: string; last_name: string | null } | null } | null;
  scanner_access?: { label: string } | null;
};

export const EVENT_SELECT =
  "id, created_at, event_type, delta, amount, points, cashback, note, undone_at, scanner_id, card_id, cards(customer_id, customers(first_name, last_name)), scanner_access(label)";

/** Une ligne d'historique, prête à afficher (sans aucun identifiant de carte). */
export function mapEvent(e: EventRow, undoable = false) {
  const t = e.event_type;
  let detail = "";
  if (t === "stamp") detail = e.delta > 1 ? `+${e.delta} tampons` : "+1 tampon";
  else if (t === "purchase") {
    const gain = e.points ? `+${e.points} point${e.points > 1 ? "s" : ""}` : e.cashback ? `+${euro(Number(e.cashback))} de cagnotte` : "";
    detail = [e.amount != null ? `Achat de ${euro(Number(e.amount))}` : "", gain].filter(Boolean).join(" · ");
  } else if (t === "points_redeemed") detail = `${e.note ?? "Cadeau"}${e.points ? ` (${e.points} pts)` : ""}`;
  else if (t === "cashback_used") detail = e.cashback ? `${euro(Math.abs(Number(e.cashback)))} déduits` : "";
  else if (t === "coupon_used") detail = e.note ?? "";
  else if (t === "reward_redeemed") detail = "Le compteur repart à zéro";
  else if (t === "correction") detail = e.note === "Bonus parrainage" ? "Bonus parrainage" : e.note ?? (e.delta ? `${e.delta > 0 ? "+" : ""}${e.delta}` : "");
  else if (t === "stamp_removed") detail = `−${Math.abs(e.delta || 1)} tampon${Math.abs(e.delta || 1) > 1 ? "s" : ""}${e.note ? ` · Raison : ${e.note}` : ""}`;
  const customer = e.cards?.customers;
  return {
    id: e.id,
    at: e.created_at,
    type: t,
    label: LABELS[t] ?? t,
    detail,
    amount: e.amount != null ? Number(e.amount) : null,
    customer: customer ? `${customer.first_name}${customer.last_name ? ` ${customer.last_name}` : ""}` : null,
    customer_id: e.cards?.customer_id ?? null,
    by: e.scanner_access?.label ?? (e.scanner_id ? "Accès supprimé" : "Automatique"),
    undone_at: e.undone_at,
    undoable,
  };
}

/**
 * Les passages que CET accès peut encore annuler : la fonction de la base n'annule que le dernier
 * tampon / achat de la carte fait par cet accès, dans les 10 minutes.
 */
export function undoableIds(events: Pick<EventRow, "id" | "created_at" | "event_type" | "undone_at" | "scanner_id" | "card_id">[], scannerId: string): Set<string> {
  const limit = Date.now() - 10 * 60000;
  const latest = new Map<string, { id: string; at: number }>();
  for (const e of events) {
    if (!(VISIT_TYPES as readonly string[]).includes(e.event_type) || e.undone_at || e.scanner_id !== scannerId) continue;
    const at = Date.parse(e.created_at);
    if (at <= limit) continue;
    const cur = latest.get(e.card_id);
    if (!cur || at > cur.at) latest.set(e.card_id, { id: e.id, at });
  }
  return new Set([...latest.values()].map((v) => v.id));
}

/** Remet à jour dans les Wallet toutes les cartes du commerce (après un changement des règles). */
export async function resyncProgramCards(program: Program, business: Business) {
  const supabase = createAdminClient();
  if (isGoogleConfigured()) {
    try {
      await upsertGoogleClass(program, business);
    } catch (err) {
      console.error("[espace resync google class]", (err as Error).message);
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

/** Phrase d'accroche de l'affiche du comptoir, au vouvoiement. */
export function pitchVous(program: Pick<Program, "mode" | "reward_threshold" | "reward_description" | "points_per_euro" | "cashback_percent">): string {
  if (program.mode === "points") {
    const p = Number(program.points_per_euro);
    return `${p} point${p > 1 ? "s" : ""} par euro, à échanger contre des cadeaux`;
  }
  if (program.mode === "cashback") return `${Number(program.cashback_percent)} % de vos achats sur votre cagnotte`;
  return `${program.reward_threshold} passages = ${program.reward_description}`;
}

/**
 * Lit toutes les lignes d'une requête, par pages de 1 000 (Supabase renvoie 1 000 lignes au maximum par demande).
 * La requête doit avoir un ordre stable.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  max = 30000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
