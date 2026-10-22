import { getMerchantRole } from "@/lib/merchant-role";
import { EVENT_SELECT, fetchAll, json, mapEvent, type EventRow } from "@/lib/merchant-space";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * « Exporter en Excel » (espace commerçant de walty.fr) : un fichier CSV que l'Excel français ouvre directement
 * (UTF-8 avec BOM, séparateur « ; », fins de ligne Windows).
 * - GET ?type=clients  : prénom, nom, téléphone, e-mail, date d'inscription, dernière visite, tampons actuels,
 *   visites, accepte les offres (oui / non) ;
 * - GET ?type=passages : date, heure, client, action, par quel accès, à la main / hors limite.
 * RÉSERVÉ AU GÉRANT (connexion par e-mail/identifiant + mot de passe, voir src/lib/merchant-role.ts),
 * seulement les données du commerce de la session, lues par pages de 1 000 lignes (limite de Supabase).
 * Aucun numéro de carte. Les cellules qui commencent par = + - @ sont neutralisées (pas de formule cachée).
 * RGPD : les clients qui n'acceptent pas les offres (« non ») ne doivent recevoir aucune promotion.
 */
export const dynamic = "force-dynamic";

const TZ = "America/Guadeloupe";
const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const day = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "");
const time = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : "");

/** Une cellule CSV : entre guillemets, sur une ligne, sans formule. */
function cell(value: unknown): string {
  let t = value == null ? "" : String(value);
  t = t.replace(/[\r\n\t]+/g, " ").trim();
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}
/** Téléphone : ="0690 12 34 56" garde le 0 du début et le « + » dans Excel (seulement chiffres, espaces, + . ( ) -). */
function phoneCell(value: string | null | undefined): string {
  const t = (value ?? "").trim();
  if (/^\+?[\d .()-]{4,30}$/.test(t)) return `"=""${t}"""`;
  return cell(t);
}
const line = (cells: string[]) => cells.join(";");

function csvResponse(name: string, header: string[], rows: string[][]) {
  const body = "﻿" + [line(header.map(cell)), ...rows.map(line)].join("\r\n") + "\r\n";
  const stamp = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="walty-${name}-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type CustomerRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  last_visit_at: string | null;
  marketing_optin: boolean;
  cards: { stamps_count: number; lifetime_visits: number; created_at: string }[] | null;
};
type ManualRow = { stamp_event_id: string | null; action: string; over_limit: boolean; reason: string | null };

export async function GET(request: Request) {
  const role = await getMerchantRole();
  if (!role) return json({ ok: false, error: "Session expirée : reconnectez-vous." }, 401);
  if (!role.manager) {
    return json({ ok: false, forbidden: true, error: "Réservé au gérant : connectez-vous avec votre e-mail et votre mot de passe." }, 403);
  }
  const biz = role.session.businessId;
  const type = new URL(request.url).searchParams.get("type");
  const supabase = createAdminClient();

  try {
    if (type === "clients") {
      const rows = await fetchAll<CustomerRow>(
        (from, to) =>
          supabase
            .from("customers")
            .select("id, first_name, last_name, phone, email, created_at, last_visit_at, marketing_optin, cards(stamps_count, lifetime_visits, created_at)")
            .eq("business_id", biz)
            .order("created_at", { ascending: true })
            .order("id")
            .range(from, to),
        100000,
      );
      return csvResponse(
        "clients",
        ["Prénom", "Nom", "Téléphone", "E-mail", "Date d'inscription", "Dernière visite", "Tampons actuels", "Visites", "Accepte les offres"],
        rows.map((c) => {
          const card = [...(c.cards ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
          return [
            cell(c.first_name),
            cell(c.last_name),
            phoneCell(c.phone),
            cell(c.email),
            cell(day(c.created_at)),
            cell(day(c.last_visit_at)),
            cell(card ? card.stamps_count : ""),
            cell(card ? card.lifetime_visits : ""),
            cell(c.marketing_optin ? "oui" : "non"),
          ];
        }),
      );
    }

    if (type === "passages") {
      const [events, manual] = await Promise.all([
        fetchAll<EventRow>(
          (from, to) =>
            supabase
              .from("stamp_events")
              .select(EVENT_SELECT)
              .eq("business_id", biz)
              .order("created_at", { ascending: false })
              .order("id")
              .range(from, to),
          100000,
        ),
        fetchAll<ManualRow>(
          (from, to) =>
            supabase
              .from("merchant_manual_actions")
              .select("stamp_event_id, action, over_limit, reason")
              .eq("business_id", biz)
              .not("stamp_event_id", "is", null)
              .order("created_at", { ascending: false })
              .order("id")
              .range(from, to),
          100000,
        ),
      ]);
      const byEvent = new Map(manual.filter((m) => m.stamp_event_id).map((m) => [m.stamp_event_id as string, m]));
      return csvResponse(
        "passages",
        ["Date", "Heure", "Client", "Action", "Par quel accès", "À la main / hors limite"],
        events.map((e) => {
          const v = mapEvent(e);
          const m = byEvent.get(e.id);
          const action = [v.label, v.detail ? `(${v.detail})` : "", e.undone_at ? `- annulé à ${time(e.undone_at)}` : ""].filter(Boolean).join(" ");
          const hand = m
            ? m.action === "remove_stamp"
              ? `Retiré par le gérant${m.reason ? ` (raison : ${m.reason})` : ""}`
              : m.over_limit
                ? `À la main, hors limite${m.reason ? ` (raison : ${m.reason})` : ""}`
                : "À la main"
            : "";
          return [cell(day(e.created_at)), cell(time(e.created_at)), cell(v.customer), cell(action), cell(v.by), cell(hand)];
        }),
      );
    }
  } catch (err) {
    console.error("[export]", type, (err as Error).message);
    return json({ ok: false, error: "Export impossible pour le moment. Réessayez." }, 500);
  }
  return json({ ok: false, error: "Indiquez ce que vous voulez exporter (clients ou passages)." }, 400);
}
