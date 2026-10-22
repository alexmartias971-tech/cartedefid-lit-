import { NextResponse } from "next/server";
import { guadeloupeLocalToDate } from "@/lib/format";
import { getMerchantRole } from "@/lib/merchant-role";
import { createNotification, GOOGLE_MAX_PER_24H, MAX_OVERRIDES_PER_WEEK, weekBounds } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEssentiel, planRefused } from "@/lib/walty-plan";

/**
 * Messages (notifications) du commerce : lister, envoyer / programmer, annuler.
 * RÉSERVÉ AU GÉRANT (session ouverte par e-mail/identifiant + mot de passe, preuve signée commercant_role,
 * voir src/lib/merchant-role.ts) : un employé qui connaît le lien d'accès et le code PIN ne peut plus écrire
 * à tous les clients en appelant cette adresse directement. L'ancienne page /m/<lien> (code PIN seulement)
 * n'a plus l'onglet « Notifier » : elle renvoie vers walty.fr/espace.
 * Formule Essentiel : pas de messages (403, Tout compris seulement).
 *
 * Limite de la semaine atteinte : le gérant peut « Envoyer quand même » après un avertissement
 * (POST { …, override: true, understood: true }) : sans répétition, 3 fois par semaine au plus, jamais
 * plus de 3 messages en 24 h (Google). Chaque envoi au-delà est noté (merchant_notification_overrides).
 */
const NO_STORE = { "Cache-Control": "no-store" };

async function managerOnly() {
  const role = await getMerchantRole();
  if (!role)
    return {
      role: null,
      res: NextResponse.json({ ok: false, error: "Session expirée : reconnectez-vous." }, { status: 401, headers: NO_STORE }),
    };
  if (!role.session.canSendNotifications) {
    return {
      role: null,
      res: NextResponse.json(
        { ok: false, error: "Les notifications ne sont pas activées pour cet accès." },
        { status: 403, headers: NO_STORE },
      ),
    };
  }
  if (!role.manager) {
    return {
      role: null,
      res: NextResponse.json(
        { ok: false, forbidden: true, error: "Réservé au gérant : connectez-vous sur walty.fr/espace avec votre e-mail et votre mot de passe." },
        { status: 403, headers: NO_STORE },
      ),
    };
  }
  return { role, res: null };
}

/** Liste des notifications + envois restants cette semaine (+ envois « au-delà » encore possibles). */
export async function GET() {
  const { role, res } = await managerOnly();
  if (!role) return res!;
  const businessId = role.session.businessId;
  const supabase = createAdminClient();
  const { start, end } = weekBounds(new Date());
  // tout est lu en même temps (formule comprise) : une seule attente réseau
  const [essentiel, { data: list }, { count }, { data: business }, { data: overrides }] = await Promise.all([
    isEssentiel(businessId),
    supabase
      .from("notifications")
      .select("id, message, status, send_at, repeat_every_days, recipients_count")
      .eq("business_id", businessId)
      .order("send_at", { ascending: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .in("status", ["scheduled", "sending", "sent"])
      .gte("send_at", start.toISOString())
      .lt("send_at", end.toISOString()),
    supabase.from("businesses").select("max_notifications_per_week").eq("id", businessId).single(),
    supabase
      .from("merchant_notification_overrides")
      .select("notification_id, week_start")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  if (essentiel) return planRefused();
  const max = business?.max_notifications_per_week ?? 0;
  const used = count ?? 0;
  const rows = (overrides ?? []) as { notification_id: string | null; week_start: string }[];
  const overIds = new Set(rows.map((o) => o.notification_id).filter(Boolean));
  const overThisWeek = rows.filter((o) => Date.parse(o.week_start) === start.getTime()).length;
  return NextResponse.json(
    {
      ok: true,
      notifications: (list ?? []).map((n) => (overIds.has(n.id) ? { ...n, over_limit: true } : n)),
      remaining: Math.max(0, max - used),
      max,
      used,
      // « Envoyer quand même » (gérant) : encore possible cette semaine ?
      canOverride: role.manager,
      overridesLeft: Math.max(0, MAX_OVERRIDES_PER_WEEK - overThisWeek),
      overridesMax: MAX_OVERRIDES_PER_WEEK,
      googleMaxPer24h: GOOGLE_MAX_PER_24H,
    },
    { headers: NO_STORE },
  );
}

/** Envoyer ou programmer une notification (au-delà de la limite : gérant + avertissement accepté). */
export async function POST(request: Request) {
  const { role, res } = await managerOnly();
  if (!role) return res!;
  const session = role.session;
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    when?: "now" | "later";
    sendAt?: string;
    repeatEveryDays?: number | null;
    repeatUntil?: string | null;
    override?: boolean;
    understood?: boolean;
  };
  if (await isEssentiel(session.businessId)) return planRefused();
  const sendAt = body.when === "later" ? guadeloupeLocalToDate(body.sendAt ?? "") : new Date();
  if (!sendAt) return NextResponse.json({ ok: false, error: "Choisis une date et une heure." }, { status: 400 });
  // « Envoyer quand même » : seulement si le gérant a coché « J'ai compris » sous l'avertissement
  if (body.override === true && body.understood !== true) {
    return NextResponse.json({ ok: false, error: "Cochez « J'ai compris » sous l'avertissement pour envoyer quand même." }, { status: 400 });
  }

  const result = await createNotification({
    businessId: session.businessId,
    message: body.message ?? "",
    sendAt,
    repeatEveryDays: body.repeatEveryDays ?? null,
    repeatUntil: body.repeatUntil ? guadeloupeLocalToDate(body.repeatUntil) : null,
    createdBy: "merchant",
    overLimit: body.override === true && role.manager ? { scannerId: session.scannerId, scannerLabel: session.label ?? "" } : null,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
}

/** Annuler une notification programmée. */
export async function DELETE(request: Request) {
  const { role, res } = await managerOnly();
  if (!role) return res!;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "Message introuvable." }, { status: 404, headers: NO_STORE });
  }
  await createAdminClient()
    .from("notifications")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("business_id", role.session.businessId)
    .eq("status", "scheduled");
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
