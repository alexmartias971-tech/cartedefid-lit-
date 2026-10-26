import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardBundle } from "./types";

/**
 * « Laisse-nous un avis Google » : demande automatique, UNE SEULE FOIS par carte (formule Tout compris).
 *
 * Qui ? Les commerces sur Tout compris (pas de ligne walty_plans, ou plan = « tout-compris ») qui ont un lien d'avis
 * Google (businesses.google_review_url), commerce et programme actifs. La carte doit être dans un Wallet (iPhone
 * enregistré ou carte Google) et, comme « Tu nous manques » et le rappel de série, le client doit avoir accepté les
 * messages du commerce (REVIEW_RULES.requireOptin : la page Confidentialité ne promet que les messages de service
 * aux autres).
 *
 * Quand ? La carte a au moins 3 passages (tampons / achats, non annulés) et son DERNIER passage date de 2 h à 26 h :
 * le message arrive environ 2 h après la visite. Un passage plus ancien n'est jamais relancé « à froid » : un fidèle
 * d'avant reçoit la demande 2 h après sa prochaine visite.
 * Jamais la nuit (21 h – 8 h, heure de Guadeloupe) : la demande attend le matin (toujours dans les 26 h). Si les 26 h
 * tombent la nuit, on prolonge jusqu'au lendemain 10 h, jamais plus de 36 h après le passage.
 * Google n'affiche pas plus de 3 notifications par carte en 24 h : si la carte en a déjà reçu 2, on attend le
 * prochain passage de la tâche (toutes les 5 minutes).
 *
 * Envoi « au plus une fois » : on RÉSERVE la carte (ligne « pending » dans review_requests, clé = card_id), puis on
 * envoie, puis la ligne passe à « sent ». Aucun téléphone joint => « failed », nouvel essai 30 min plus tard (3 au plus).
 * Coupure entre l'envoi et l'écriture => la ligne reste « pending » : jamais renvoyée (au pire une demande perdue,
 * jamais deux).
 *
 * Ce fichier ne contient que la logique (aucun import serveur) : il est testé à blanc par
 * scripts/test-avis-google.mjs, avec une fausse base et de faux envois. Branchement réel : review-requests.ts.
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const GP_OFFSET = 4 * HOUR; // la Guadeloupe est à UTC-4 toute l'année

/** Le message (180 caractères au plus, comme les autres) : pas de promotion ni de récompense (interdit par Google). */
export const REVIEW_MESSAGE =
  "Merci pour ta visite ! ⭐ Ton avis compte : laisse-nous un avis Google, le lien est sur ta carte.";

export const REVIEW_RULES = {
  minVisits: 3,
  /** Délai après le dernier passage. */
  delayMs: 2 * HOUR,
  /** Après 26 h, le passage est trop ancien (sauf prolongation du matin, voir askDeadline). */
  windowMs: 26 * HOUR,
  maxWindowMs: 36 * HOUR,
  /** Heures calmes (heure de Guadeloupe) : rien entre 21 h et 8 h. */
  quietFrom: 21,
  quietUntil: 8,
  /** Prolongation du matin : jusqu'à 10 h. */
  morningUntil: 10,
  /** Seulement les clients qui ont accepté les messages du commerce. */
  requireOptin: true,
  maxAttempts: 3,
  retryAfterMs: 30 * MIN,
  /** Par passage de la tâche : 15 envois au plus, 25 secondes au plus. */
  batch: 15,
  budgetMs: 25 * 1000,
} as const;

/** Les événements qui comptent comme un passage (même liste que merchant-space.ts VISIT_TYPES). */
const VISIT_TYPES = ["stamp", "purchase"];
/** Même astuce que sendNotification : l'iPhone ne notifie que si le texte CHANGE (caractère invisible U+2060). */
const INVISIBLE = "⁠";

export type SendOutcome = { apple: number; google: boolean } | null;

export type ReviewDeps = {
  db: SupabaseClient;
  now?: () => number;
  loadBundles: (ids: string[]) => Promise<CardBundle[]>;
  /** Met la carte à jour dans le Wallet et notifie (syncCard) ; dit ce qui a réellement été envoyé. */
  send: (cardId: string, message: { header: string; body: string }) => Promise<SendOutcome>;
  /** Limite Google par carte et par 24 h (GOOGLE_MAX_PER_24H de notifications.ts). */
  googleMaxPer24h: number;
  batch?: number;
  budgetMs?: number;
};

export type ReviewRunReport = {
  /** Heures calmes : rien n'a été regardé. */
  quiet: boolean;
  /** Arrêt prudent (lecture impossible, table absente…) : rien n'a été envoyé. */
  aborted: string | null;
  businesses: number;
  /** Cartes dont le dernier passage est dans la bonne fenêtre et pas encore demandées. */
  candidates: number;
  waiting: number;
  expired: number;
  asked_before: number;
  skipped: { visits: number; optin: number; wallet: number; inactive: number; google_limit: number; claimed: number };
  sent: number;
  /** Envoi tenté, aucun téléphone joint (nouvel essai plus tard). */
  failed: number;
  /** Lecture impossible pour une carte (rien n'a été envoyé, elle sera revue au prochain passage). */
  errors: number;
  stopped_by_budget: boolean;
};

export type ReviewEvent = {
  id?: string;
  card_id?: string;
  event_type: string;
  delta?: number | null;
  amount?: number | string | null;
  note?: string | null;
  undone_at: string | null;
  created_at: string;
};

// ------------------------------------------------------------------ heures

const local = (t: number) => new Date(t - GP_OFFSET);

/** Heure (0-23) en Guadeloupe. */
export function gpHour(t: number): number {
  return local(t).getUTCHours();
}

/** Entre 21 h et 8 h (heure de Guadeloupe) : pas de demande d'avis. */
export function isQuietTime(t: number): boolean {
  const h = gpHour(t);
  return h >= REVIEW_RULES.quietFrom || h < REVIEW_RULES.quietUntil;
}

/** Jusqu'à quand on peut encore demander l'avis pour ce passage : 26 h, prolongées au lendemain 10 h si c'est la nuit (36 h au plus). */
export function askDeadline(visitAt: number): number {
  const base = visitAt + REVIEW_RULES.windowMs;
  if (!isQuietTime(base)) return base;
  const l = local(base);
  let morning = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), REVIEW_RULES.morningUntil) + GP_OFFSET;
  if (morning <= base) morning += DAY; // 21 h – minuit : le lendemain matin
  return Math.min(morning, visitAt + REVIEW_RULES.maxWindowMs);
}

export type Timing = "too_soon" | "ok" | "expired";

/** Le dernier passage permet-il de demander l'avis maintenant ? */
export function visitTiming(lastVisitAt: number, now: number): Timing {
  if (now - lastVisitAt < REVIEW_RULES.delayMs) return "too_soon";
  if (now > askDeadline(lastVisitAt)) return "expired";
  return "ok";
}

// ------------------------------------------------------------------ limite Google (3 par carte en 24 h)

/** Lundi (AAAA-MM-JJ) et heure d'envoi du rappel de série de la semaine (0 = cette semaine, 1 = la précédente). */
function streakReminder(now: number, dow: number, hour: number, weeksAgo: number) {
  const l = local(now);
  const fromMonday = (l.getUTCDay() + 6) % 7;
  const monday = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - fromMonday - 7 * weeksAgo);
  // dow comme en SQL (extract dow) : 0 = dimanche
  return { monday: new Date(monday).toISOString().slice(0, 10), at: monday + ((dow + 6) % 7) * DAY + hour * HOUR + GP_OFFSET };
}

/**
 * Nombre de notifications Google déjà reçues par cette carte dans les 24 dernières heures. Aucun journal par carte
 * n'existe : on le reconstitue avec ce que la base garde, en comptant large plutôt que trop peu :
 *  - les messages du commerce envoyés (table notifications), si le client les accepte ;
 *  - « Tu nous manques » (cards.winback_sent_at) et le rappel de série (cards.streak_reminded_week + jour/heure réglés) ;
 *  - les messages envoyés au passage, un au plus par moment : bonus de série ou de parrainage (événements
 *    « correction »), cadeau débloqué (dernier tampon avant le cadeau remis, ou cadeau prêt en ce moment),
 *    nouveau niveau (seuil franchi par un passage des 24 h), nouveau record (cards.best_lap_at).
 * `events` : les événements de la carte depuis au moins 24 h (tous types).
 */
export function googleMessagesLast24h(b: CardBundle, events: ReviewEvent[], broadcasts24h: number, now: number): number {
  const since = now - DAY;
  const ts = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);
  const recent = (s: string | null | undefined) => {
    const t = ts(s);
    return t > since && t <= now;
  };
  let count = 0;
  if (b.customer.marketing_optin) count += broadcasts24h;
  if (recent(b.card.winback_sent_at)) count++;
  if (b.program.streak_enabled && b.card.streak_reminded_week) {
    for (const weeksAgo of [0, 1]) {
      const r = streakReminder(now, b.program.streak_reminder_dow, b.program.streak_reminder_hour, weeksAgo);
      if (b.card.streak_reminded_week === r.monday && r.at > since && r.at <= now) count++;
    }
  }

  const live = events.filter((e) => !e.undone_at).sort((a, z) => ts(a.created_at) - ts(z.created_at));
  const visits = live.filter((e) => VISIT_TYPES.includes(e.event_type));
  const moments = new Set<number>();
  for (const e of live) {
    if (!recent(e.created_at)) continue;
    if (e.event_type === "correction") moments.add(ts(e.created_at)); // bonus de série / de parrainage
    if (e.event_type === "reward_redeemed") {
      const unlock = [...live].reverse().find((s) => s.event_type === "stamp" && ts(s.created_at) <= ts(e.created_at));
      if (unlock && recent(unlock.created_at)) moments.add(ts(unlock.created_at));
    }
  }
  // Cadeau prêt en ce moment : c'est le dernier tampon qui l'a débloqué (aucun tampon n'est ajouté ensuite)
  if (b.program.mode === "stamps" && b.card.stamps_count >= b.program.reward_threshold) {
    const last = [...visits].reverse().find((e) => e.event_type === "stamp");
    if (last && recent(last.created_at)) moments.add(ts(last.created_at));
  }
  // Nouveau niveau : un passage des 24 h a franchi un seuil (on remonte depuis la valeur actuelle)
  if (b.program.tiers_enabled && b.tiers.length > 0) {
    const spend = b.program.tier_basis === "spend";
    const mins = b.tiers.map((t) => Number(t.min_value));
    let metric = spend ? Number(b.card.lifetime_spent ?? 0) : Number(b.card.lifetime_visits ?? 0);
    for (const v of [...visits].reverse()) {
      if (!recent(v.created_at)) break;
      const step = spend ? (v.event_type === "purchase" ? Number(v.amount ?? 0) : 0) : 1;
      const before = metric - step;
      if (step > 0 && mins.some((m) => m > before && m <= metric)) moments.add(ts(v.created_at));
      metric = before;
    }
  }
  if (recent(b.card.best_lap_at)) moments.add(ts(b.card.best_lap_at));
  return count + moments.size;
}

// ------------------------------------------------------------------ la tâche

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type Previous = { status: string; attempts: number; updated_at: string };
type Candidate = { card_id: string; business_id: string; lastVisitAt: number };

/** Appelé par la tâche planifiée (toutes les 5 minutes). Ne lève jamais d'erreur pour une carte : elle est comptée. */
export async function runReviewRequestsWith(deps: ReviewDeps): Promise<ReviewRunReport> {
  const clock = deps.now ?? Date.now;
  const now = clock();
  const started = Date.now();
  const batch = deps.batch ?? REVIEW_RULES.batch;
  const budgetMs = deps.budgetMs ?? REVIEW_RULES.budgetMs;
  const db = deps.db;
  const iso = (t: number) => new Date(t).toISOString();
  const report: ReviewRunReport = {
    quiet: false,
    aborted: null,
    businesses: 0,
    candidates: 0,
    waiting: 0,
    expired: 0,
    asked_before: 0,
    skipped: { visits: 0, optin: 0, wallet: 0, inactive: 0, google_limit: 0, claimed: 0 },
    sent: 0,
    failed: 0,
    errors: 0,
    stopped_by_budget: false,
  };
  const abort = (why: string) => {
    report.aborted = why.slice(0, 200);
    return report;
  };

  if (isQuietTime(now)) {
    report.quiet = true;
    return report;
  }

  // 1. Les commerces actifs avec un lien d'avis Google…
  const { data: bizRows, error: bizError } = await db
    .from("businesses")
    .select("id, google_review_url")
    .eq("status", "active")
    .not("google_review_url", "is", null);
  if (bizError) return abort(`businesses : ${bizError.message}`);
  const withLink = ((bizRows ?? []) as { id: string; google_review_url: string | null }[]).filter((b) => isHttpsUrl(b.google_review_url));
  if (withLink.length === 0) return report;

  // 2. … sur la formule Tout compris (pas de ligne = Tout compris). Formule illisible : on n'envoie rien.
  const planOf = new Map<string, string>();
  for (const ids of chunks(withLink.map((b) => b.id), 100)) {
    const { data, error } = await db.from("walty_plans").select("business_id, plan").in("business_id", ids);
    if (error) return abort(`walty_plans : ${error.message}`);
    for (const p of (data ?? []) as { business_id: string; plan: string }[]) planOf.set(p.business_id, p.plan);
  }
  const businessIds = withLink.filter((b) => !planOf.has(b.id) || planOf.get(b.id) === "tout-compris").map((b) => b.id);
  report.businesses = businessIds.length;
  if (businessIds.length === 0) return report;

  // 3. Le dernier passage (non annulé) de chaque carte de ces commerces, sur les 36 dernières heures
  const lastVisit = new Map<string, { at: number; business_id: string }>();
  for (const ids of chunks(businessIds, 100)) {
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await db
        .from("stamp_events")
        .select("card_id, business_id, created_at")
        .in("business_id", ids)
        .in("event_type", VISIT_TYPES)
        .is("undone_at", null)
        .gte("created_at", iso(now - REVIEW_RULES.maxWindowMs))
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      if (error) return abort(`stamp_events : ${error.message}`);
      const rows = (data ?? []) as { card_id: string; business_id: string; created_at: string }[];
      for (const e of rows) {
        const at = Date.parse(e.created_at);
        const cur = lastVisit.get(e.card_id);
        if (!cur || at > cur.at) lastVisit.set(e.card_id, { at, business_id: e.business_id });
      }
      if (rows.length < 1000) break;
    }
  }

  let candidates: Candidate[] = [];
  for (const [card_id, v] of lastVisit) {
    const timing = visitTiming(v.at, now);
    if (timing === "too_soon") report.waiting++;
    else if (timing === "expired") report.expired++;
    else candidates.push({ card_id, business_id: v.business_id, lastVisitAt: v.at });
  }
  if (candidates.length === 0) return report;

  // 4. Déjà demandé ? (table absente ou illisible : arrêt, rien n'est envoyé)
  const previous = new Map<string, Previous>();
  for (const ids of chunks(candidates.map((c) => c.card_id), 200)) {
    const { data, error } = await db.from("review_requests").select("card_id, status, attempts, updated_at").in("card_id", ids);
    if (error) return abort(`review_requests : ${error.message}`);
    for (const r of (data ?? []) as (Previous & { card_id: string })[]) previous.set(r.card_id, r);
  }
  const retryable = (p: Previous) =>
    p.status === "failed" && p.attempts < REVIEW_RULES.maxAttempts && Date.parse(p.updated_at) <= now - REVIEW_RULES.retryAfterMs;
  candidates = candidates.filter((c) => {
    const p = previous.get(c.card_id);
    if (!p || retryable(p)) return true;
    report.asked_before++;
    return false;
  });
  report.candidates = candidates.length;
  if (candidates.length === 0) return report;

  // 5. Tri rapide, en une lecture par table : assez de passages, client d'accord, carte dans un Wallet
  const cardInfo = new Map<string, { customer_id: string; lifetime_visits: number; google_saved: boolean }>();
  const optin = new Map<string, boolean>();
  const onIphone = new Set<string>();
  for (const ids of chunks(candidates.map((c) => c.card_id), 200)) {
    const { data, error } = await db.from("cards").select("id, customer_id, lifetime_visits, google_saved").in("id", ids);
    if (error) return abort(`cards : ${error.message}`);
    for (const c of (data ?? []) as { id: string; customer_id: string; lifetime_visits: number; google_saved: boolean }[]) cardInfo.set(c.id, c);
    const { data: regs, error: regError } = await db.from("apple_device_registrations").select("card_id").in("card_id", ids);
    if (regError) return abort(`apple_device_registrations : ${regError.message}`);
    for (const r of (regs ?? []) as { card_id: string }[]) onIphone.add(r.card_id);
  }
  const customerIds = [...new Set([...cardInfo.values()].map((c) => c.customer_id))];
  for (const ids of chunks(customerIds, 200)) {
    const { data, error } = await db.from("customers").select("id, marketing_optin").in("id", ids);
    if (error) return abort(`customers : ${error.message}`);
    for (const c of (data ?? []) as { id: string; marketing_optin: boolean }[]) optin.set(c.id, c.marketing_optin === true);
  }
  const finalists = candidates
    .filter((c) => {
      const card = cardInfo.get(c.card_id);
      // lifetime_visits suit les passages (+1 au tampon / à l'achat, -1 à l'annulation) : simple tri, le compte exact vient plus bas
      if (!card || Number(card.lifetime_visits ?? 0) < REVIEW_RULES.minVisits) {
        report.skipped.visits++;
        return false;
      }
      if (REVIEW_RULES.requireOptin && !optin.get(card.customer_id)) {
        report.skipped.optin++;
        return false;
      }
      if (!card.google_saved && !onIphone.has(c.card_id)) {
        report.skipped.wallet++;
        return false;
      }
      return true;
    })
    // Les passages les plus anciens d'abord (les plus proches de la limite)
    .sort((a, z) => a.lastVisitAt - z.lastVisitAt);

  // 6. Carte par carte, dans la limite du lot et du temps
  const broadcasts = new Map<string, number>();
  const broadcasts24h = async (businessId: string) => {
    if (!broadcasts.has(businessId)) {
      const { count, error } = await db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .in("status", ["sending", "sent"])
        .gt("send_at", iso(now - DAY));
      if (error) throw new Error(`notifications : ${error.message}`);
      broadcasts.set(businessId, count ?? 0);
    }
    return broadcasts.get(businessId)!;
  };
  const finish = async (cardId: string, patch: Record<string, unknown>) => {
    const { error } = await db.from("review_requests").update({ ...patch, updated_at: iso(clock()) }).eq("card_id", cardId);
    if (error) console.error("[avis Google] suivi", error.message);
  };

  let tried = 0;
  let checks = 0;
  for (const c of finalists) {
    if (tried >= batch || checks >= batch * 4) break;
    if (Date.now() - started > budgetMs) {
      report.stopped_by_budget = true;
      break;
    }
    checks++;
    try {
      // Le compte exact : au moins 3 passages non annulés
      const { data: visits, error: visitError } = await db
        .from("stamp_events")
        .select("id")
        .eq("card_id", c.card_id)
        .in("event_type", VISIT_TYPES)
        .is("undone_at", null)
        .limit(REVIEW_RULES.minVisits);
      if (visitError) throw new Error(`stamp_events : ${visitError.message}`);
      if ((visits ?? []).length < REVIEW_RULES.minVisits) {
        report.skipped.visits++;
        continue;
      }

      const [bundle] = await deps.loadBundles([c.card_id]);
      if (
        !bundle ||
        bundle.business.status !== "active" ||
        !bundle.program.is_active ||
        !isHttpsUrl(bundle.business.google_review_url) ||
        (REVIEW_RULES.requireOptin && !bundle.customer.marketing_optin)
      ) {
        report.skipped.inactive++;
        continue;
      }

      // Google : déjà 2 notifications en 24 h ? On attend le prochain passage de la tâche.
      if (bundle.card.google_saved) {
        const { data: events, error: evError } = await db
          .from("stamp_events")
          .select("id, card_id, event_type, delta, amount, note, undone_at, created_at")
          .eq("card_id", c.card_id)
          .gte("created_at", iso(now - REVIEW_RULES.maxWindowMs));
        if (evError) throw new Error(`stamp_events : ${evError.message}`);
        const already = googleMessagesLast24h(bundle, (events ?? []) as ReviewEvent[], await broadcasts24h(bundle.business.id), now);
        if (already >= deps.googleMaxPer24h - 1) {
          report.skipped.google_limit++;
          continue;
        }
      }

      // Réservation : une seule tâche peut envoyer (clé primaire card_id ; nouvel essai : seulement depuis « failed »)
      tried++;
      const prev = previous.get(c.card_id);
      let claimed = false;
      if (prev) {
        const { data, error } = await db
          .from("review_requests")
          .update({ status: "pending", attempts: prev.attempts + 1, error: null, updated_at: iso(clock()) })
          .eq("card_id", c.card_id)
          .eq("status", "failed")
          .eq("attempts", prev.attempts)
          .select("card_id");
        claimed = !error && (data ?? []).length === 1;
      } else {
        const { error } = await db
          .from("review_requests")
          .insert({ card_id: c.card_id, business_id: bundle.business.id, status: "pending", attempts: 1 });
        if (error && error.code !== "23505") console.error("[avis Google] réservation", error.message);
        claimed = !error;
      }
      if (!claimed) {
        report.skipped.claimed++;
        continue;
      }

      // Le message sur la carte (iPhone : la notification vient de ce texte qui change), puis l'envoi
      const text = bundle.card.last_message === REVIEW_MESSAGE ? REVIEW_MESSAGE + INVISIBLE : REVIEW_MESSAGE;
      const { error: msgError } = await db.from("cards").update({ last_message: text }).eq("id", c.card_id);
      if (msgError) {
        await finish(c.card_id, { status: "failed", error: `Message non écrit : ${msgError.message}`.slice(0, 300) });
        report.failed++;
        continue;
      }
      const outcome = await deps.send(c.card_id, { header: bundle.business.name, body: REVIEW_MESSAGE }).catch(() => null);
      if (outcome && (outcome.apple > 0 || outcome.google)) {
        await finish(c.card_id, { status: "sent", sent_at: iso(clock()), error: null });
        report.sent++;
      } else {
        await finish(c.card_id, { status: "failed", error: "Aucun téléphone joint" });
        report.failed++;
      }
    } catch (err) {
      console.error("[avis Google]", (err as Error).message);
      report.errors++;
    }
  }
  return report;
}
