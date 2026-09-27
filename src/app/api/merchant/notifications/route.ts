import { NextResponse } from "next/server";
import { guadeloupeLocalToDate } from "@/lib/format";
import { getMerchantSession } from "@/lib/merchant-session";
import { createNotification, weekBounds } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";

async function session403() {
  const session = await getMerchantSession();
  if (!session)
    return {
      session: null,
      res: NextResponse.json({ ok: false, error: "Session expirée : retape ton code PIN." }, { status: 401 }),
    };
  if (!session.canSendNotifications) {
    return {
      session: null,
      res: NextResponse.json(
        { ok: false, error: "Les notifications ne sont pas activées pour cet accès." },
        { status: 403 },
      ),
    };
  }
  return { session, res: null };
}

/** Liste des notifications + envois restants cette semaine. */
export async function GET() {
  const { session, res } = await session403();
  if (!session) return res!;
  const supabase = createAdminClient();
  const { start, end } = weekBounds(new Date());
  const [{ data: list }, { count }, { data: business }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, message, status, send_at, repeat_every_days, recipients_count")
      .eq("business_id", session.businessId)
      .order("send_at", { ascending: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("business_id", session.businessId)
      .in("status", ["scheduled", "sending", "sent"])
      .gte("send_at", start.toISOString())
      .lt("send_at", end.toISOString()),
    supabase.from("businesses").select("max_notifications_per_week").eq("id", session.businessId).single(),
  ]);
  return NextResponse.json({
    ok: true,
    notifications: list ?? [],
    remaining: Math.max(0, (business?.max_notifications_per_week ?? 0) - (count ?? 0)),
  });
}

/** Envoyer ou programmer une notification. */
export async function POST(request: Request) {
  const { session, res } = await session403();
  if (!session) return res!;
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    when?: "now" | "later";
    sendAt?: string;
    repeatEveryDays?: number | null;
    repeatUntil?: string | null;
  };
  const sendAt = body.when === "later" ? guadeloupeLocalToDate(body.sendAt ?? "") : new Date();
  if (!sendAt) return NextResponse.json({ ok: false, error: "Choisis une date et une heure." }, { status: 400 });

  const result = await createNotification({
    businessId: session.businessId,
    message: body.message ?? "",
    sendAt,
    repeatEveryDays: body.repeatEveryDays ?? null,
    repeatUntil: body.repeatUntil ? guadeloupeLocalToDate(body.repeatUntil) : null,
    createdBy: "merchant",
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

/** Annuler une notification programmée. */
export async function DELETE(request: Request) {
  const { session, res } = await session403();
  if (!session) return res!;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  await createAdminClient()
    .from("notifications")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("business_id", session.businessId)
    .eq("status", "scheduled");
  return NextResponse.json({ ok: true });
}
