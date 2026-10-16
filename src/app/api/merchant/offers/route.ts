import { NextResponse, after } from "next/server";
import { loadCardBundlesByIds } from "@/lib/cards";
import { getMerchantSession } from "@/lib/merchant-session";
import { fetchAll } from "@/lib/merchant-space";
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCards } from "@/lib/wallet-sync";

const noStore = { "Cache-Control": "no-store" };

/**
 * Offres ponctuelles du commerce (ex : « -20 % ce week-end ») pour l'espace commerçant de walty.fr.
 * Même fonctionnement que le bouton « Offre à tous les clients » du tableau de bord admin :
 * l'offre s'ajoute sur la carte de chaque client et se valide en caisse au scan.
 */
export async function GET() {
  const session = await getMerchantSession();
  if (!session) return NextResponse.json({ ok: false, error: "Session expirée : retapez votre code PIN." }, { status: 401 });
  const supabase = createAdminClient();
  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("id, welcome_offer, birthday_offer")
    .eq("business_id", session.businessId)
    .maybeSingle();
  if (!program) return NextResponse.json({ ok: true, offers: [], welcome: null, birthday: null, canSend: session.canSendNotifications });

  // Supabase renvoie 1 000 lignes au maximum par demande : on lit par pages (une offre = une ligne par client)
  type CouponRow = { title: string; status: string; created_at: string; expires_at: string | null };
  let rows: CouponRow[];
  try {
    rows = await fetchAll<CouponRow>(
      (from, to) =>
        supabase
          .from("coupons")
          .select("id, title, status, created_at, expires_at")
          .eq("program_id", program.id)
          .eq("kind", "manual")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      50000,
    );
  } catch (err) {
    console.error("[offers list]", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Impossible de charger vos offres. Réessayez." }, { status: 500, headers: noStore });
  }

  // Une offre = toutes les lignes créées ensemble (même titre, même minute)
  const now = Date.now();
  const groups = new Map<string, { title: string; created_at: string; expires_at: string | null; total: number; used: number; active: number }>();
  for (const r of rows) {
    const key = `${r.title}|${r.created_at.slice(0, 16)}`;
    let g = groups.get(key);
    if (!g) {
      g = { title: r.title, created_at: r.created_at, expires_at: r.expires_at, total: 0, used: 0, active: 0 };
      groups.set(key, g);
    }
    g.total++;
    if (r.status === "used") g.used++;
    else if (r.status === "active" && (!r.expires_at || Date.parse(r.expires_at) > now)) g.active++;
  }

  return NextResponse.json(
    {
      ok: true,
      offers: [...groups.values()].slice(0, 20),
      welcome: program.welcome_offer,
      birthday: program.birthday_offer,
      canSend: session.canSendNotifications,
    },
    { headers: noStore },
  );
}

/** Ajouter une offre sur la carte de tous les clients (et, si demandé, les prévenir par notification). */
export async function POST(request: Request) {
  const session = await getMerchantSession();
  if (!session) return NextResponse.json({ ok: false, error: "Session expirée : retapez votre code PIN." }, { status: 401 });
  if (!session.canSendNotifications) {
    return NextResponse.json({ ok: false, error: "Les offres ne sont pas activées pour cet accès." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { title?: string; days?: number | null; notify?: boolean };
  const title = String(body.title ?? "").trim().slice(0, 120);
  if (title.length < 3) return NextResponse.json({ ok: false, error: "Écrivez l'offre (ex : -20 % sur tout ce week-end)." }, { status: 400 });
  const days = Number(body.days) > 0 ? Math.min(90, Math.round(Number(body.days))) : null;

  const supabase = createAdminClient();
  const { data: program } = await supabase.from("loyalty_programs").select("id").eq("business_id", session.businessId).single();
  if (!program) return NextResponse.json({ ok: false, error: "Carte introuvable." }, { status: 404 });

  // Anti double-clic : la même offre vient d'être ajoutée
  const { count: dup } = await supabase
    .from("coupons")
    .select("id", { count: "exact", head: true })
    .eq("program_id", program.id)
    .eq("kind", "manual")
    .eq("title", title)
    .gte("created_at", new Date(Date.now() - 10 * 60000).toISOString());
  if ((dup ?? 0) > 0) return NextResponse.json({ ok: false, error: "Cette offre vient déjà d'être ajoutée." }, { status: 409 });

  // TOUTES les cartes (par pages de 1 000 : sinon seuls les 1 000 premiers clients recevraient l'offre)
  type CardRow = { id: string; customers: { marketing_optin: boolean } | null };
  let cards: CardRow[];
  try {
    cards = await fetchAll<CardRow>((from, to) =>
      supabase.from("cards").select("id, customers(marketing_optin)").eq("program_id", program.id).order("id").range(from, to),
    );
  } catch (err) {
    console.error("[offers cards]", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Erreur serveur, réessayez." }, { status: 500 });
  }
  const ids = cards.map((c) => c.id);
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "Aucun client pour le moment." }, { status: 400 });
  const expires = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const { error } = await supabase
      .from("coupons")
      .insert(slice.map((card_id) => ({ card_id, program_id: program.id, title, kind: "manual", expires_at: expires })));
    if (error) {
      console.error("[offers]", error.message);
      return NextResponse.json({ ok: false, error: "Erreur serveur, réessayez." }, { status: 500 });
    }
    await supabase.from("cards").update({ updated_at: new Date().toISOString() }).in("id", slice);
  }

  let warning: string | undefined;
  let notified = false;
  if (body.notify) {
    const res = await createNotification({
      businessId: session.businessId,
      message: `🎁 Nouvelle offre sur ta carte : ${title}`.slice(0, 180),
      sendAt: new Date(),
      repeatEveryDays: null,
      repeatUntil: null,
      createdBy: "merchant",
    });
    if (!res.ok) warning = `Offre ajoutée, mais la notification n'est pas partie : ${res.error}`;
    else notified = res.sentNow;
  }
  // Les cartes dans les téléphones se mettent à jour en arrière-plan.
  // La notification ne met à jour que les cartes des clients qui ont accepté les offres :
  // les autres cartes doivent quand même recevoir l'offre.
  const toSync = notified ? cards.filter((c) => !c.customers?.marketing_optin).map((c) => c.id) : ids;
  if (toSync.length > 0) {
    after(async () => {
      for (let i = 0; i < toSync.length; i += 200) await syncCards(await loadCardBundlesByIds(toSync.slice(i, i + 200)));
    });
  }
  return NextResponse.json({ ok: true, count: ids.length, warning }, { headers: noStore });
}
