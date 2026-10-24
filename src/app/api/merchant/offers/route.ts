import { NextResponse, after } from "next/server";
import { loadCardBundlesByIds } from "@/lib/cards";
import { getMerchantRole } from "@/lib/merchant-role";
import { fetchAll, requireManager } from "@/lib/merchant-space";
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCards } from "@/lib/wallet-sync";
import { isEssentiel, planRefused } from "@/lib/walty-plan";

const noStore = { "Cache-Control": "no-store" };

/**
 * Offres ponctuelles du commerce (ex : « -20 % ce week-end ») pour l'espace commerçant de walty.fr.
 * Même fonctionnement que le bouton « Offre à tous les clients » du tableau de bord admin :
 * l'offre s'ajoute sur la carte de chaque client et se valide en caisse au scan.
 * Formule Essentiel : pas d'offres (403, Tout compris seulement).
 */
export async function GET() {
  // réservé au gérant (connexion e-mail + mot de passe), vérifié ici (plus par la passerelle walty.fr)
  const { role, res } = await requireManager();
  if (!role) return res;
  const session = role.session;
  const supabase = createAdminClient();
  // formule et programme lus en même temps (une attente réseau de moins)
  const [essentiel, { data: program }] = await Promise.all([
    isEssentiel(session.businessId),
    supabase.from("loyalty_programs").select("id, welcome_offer").eq("business_id", session.businessId).maybeSingle(),
  ]);
  if (essentiel) return planRefused();
  if (!program) return NextResponse.json({ ok: true, offers: [], welcome: null, canSend: session.canSendNotifications });

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
      canSend: session.canSendNotifications,
    },
    { headers: noStore },
  );
}

/** Ajouter une offre sur la carte de tous les clients (et, si demandé, les prévenir par notification). */
export async function POST(request: Request) {
  // gérant prouvé (connexion par mot de passe) : un employé qui connaît le PIN ne peut pas créer d'offre
  const role = await getMerchantRole();
  if (!role) return NextResponse.json({ ok: false, error: "Session expirée : retapez votre code PIN." }, { status: 401 });
  const session = role.session;
  if (!session.canSendNotifications) {
    return NextResponse.json({ ok: false, error: "Les offres ne sont pas activées pour cet accès." }, { status: 403 });
  }
  if (!role.manager) {
    return NextResponse.json(
      { ok: false, forbidden: true, error: "Connectez-vous avec l'e-mail et le mot de passe du gérant pour créer une offre." },
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { title?: string; days?: number | null; notify?: boolean };
  const title = String(body.title ?? "").trim().slice(0, 120);
  if (title.length < 3) return NextResponse.json({ ok: false, error: "Écrivez l'offre (ex : -20 % sur tout ce week-end)." }, { status: 400 });
  const days = Number(body.days) > 0 ? Math.min(90, Math.round(Number(body.days))) : null;

  const supabase = createAdminClient();
  // formule, programme et anti double-clic lus en même temps (une attente réseau au lieu de trois)
  const [essentiel, { data: program }, { count: dup }] = await Promise.all([
    isEssentiel(session.businessId),
    supabase.from("loyalty_programs").select("id").eq("business_id", session.businessId).single(),
    // Anti double-clic : la même offre vient d'être ajoutée (filtre par commerce via le programme)
    supabase
      .from("coupons")
      .select("id, loyalty_programs!inner(business_id)", { count: "exact", head: true })
      .eq("loyalty_programs.business_id", session.businessId)
      .eq("kind", "manual")
      .eq("title", title)
      .gte("created_at", new Date(Date.now() - 10 * 60000).toISOString()),
  ]);
  if (essentiel) return planRefused();
  if (!program) return NextResponse.json({ ok: false, error: "Carte introuvable." }, { status: 404 });
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
    // l'offre et la date de mise à jour des cartes (pour les iPhone) partent en même temps
    const [{ error }] = await Promise.all([
      supabase.from("coupons").insert(slice.map((card_id) => ({ card_id, program_id: program.id, title, kind: "manual", expires_at: expires }))),
      supabase.from("cards").update({ updated_at: new Date().toISOString() }).in("id", slice),
    ]);
    if (error) {
      console.error("[offers]", error.message);
      return NextResponse.json({ ok: false, error: "Erreur serveur, réessayez." }, { status: 500 });
    }
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
