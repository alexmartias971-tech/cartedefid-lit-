import Link from "next/link";
import { notFound } from "next/navigation";
import AccessForm from "@/components/AccessForm";
import BusinessForm from "@/components/BusinessForm";
import ConfirmButton from "@/components/ConfirmButton";
import CopyField from "@/components/CopyField";
import NotificationForm from "@/components/NotificationForm";
import { requireAdmin } from "@/lib/admin-auth";
import { appUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import type { Business, Customer, NotificationRow, Program } from "@/lib/types";
import {
  adminCancelNotification,
  adminCreateNotification,
  deleteAccess,
  deleteCustomer,
  setBusinessStatus,
  setProgramActive,
  updateAccess,
} from "../../actions";

const STATUS_LABELS: Record<NotificationRow["status"], string> = {
  scheduled: "Programmée",
  sending: "En cours",
  sent: "Envoyée",
  cancelled: "Annulée",
  failed: "Échec",
  skipped: "Sautée (limite)",
};

export default async function EntreprisePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; cree?: string }>;
}) {
  const { id } = await params;
  const { q, cree } = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: businessData } = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
  if (!businessData) notFound();
  const business = businessData as Business;
  const { data: programData } = await supabase.from("loyalty_programs").select("*").eq("business_id", id).maybeSingle();
  const program = programData as Program | null;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(4, 0, 0, 0);

  let customersQuery = supabase
    .from("customers")
    .select("*, cards(stamps_count, rewards_redeemed, wallet_platform)")
    .eq("business_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ").trim();
    customersQuery = customersQuery.or(
      `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
    );
  }

  const [customersRes, countRes, optinRes, stampsRes, redeemedRes, accessRes, notifRes, platformRes] =
    await Promise.all([
      customersQuery,
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", id),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", id)
        .eq("marketing_optin", true),
      supabase
        .from("stamp_events")
        .select("id", { count: "exact", head: true })
        .eq("business_id", id)
        .eq("event_type", "stamp")
        .is("undone_at", null)
        .gte("created_at", monthStart.toISOString()),
      supabase
        .from("stamp_events")
        .select("id", { count: "exact", head: true })
        .eq("business_id", id)
        .eq("event_type", "reward_redeemed"),
      supabase.from("scanner_access").select("*").eq("business_id", id).order("created_at"),
      supabase.from("notifications").select("*").eq("business_id", id).order("send_at", { ascending: false }).limit(30),
      supabase.from("cards").select("wallet_platform, customers!inner(business_id)").eq("customers.business_id", id),
    ]);

  type CustomerRow = Customer & {
    cards: { stamps_count: number; rewards_redeemed: number; wallet_platform: string | null }[];
  };
  const customers = (customersRes.data ?? []) as CustomerRow[];
  const accesses = (accessRes.data ?? []) as {
    id: string;
    label: string;
    access_token: string;
    is_active: boolean;
    can_send_notifications: boolean;
    failed_attempts: number;
    last_used_at: string | null;
  }[];
  const notifications = (notifRes.data ?? []) as NotificationRow[];
  const platforms = (platformRes.data ?? []) as { wallet_platform: string | null }[];
  const byPlatform = (p: string) => platforms.filter((c) => c.wallet_platform === p).length;
  const signupUrl = `${appUrl()}/c/${business.slug}`;

  const stats = [
    { label: "Clients inscrits", value: countRes.count ?? 0 },
    { label: "Acceptent les offres", value: optinRes.count ?? 0 },
    { label: "Tampons ce mois-ci", value: stampsRes.count ?? 0 },
    { label: "Cadeaux remis", value: redeemedRes.count ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm underline text-gray-600">
            ← Mes entreprises
          </Link>
          <h1 className="text-3xl font-bold mt-1">{business.name}</h1>
          <p
            className={business.status === "active" ? "text-green-700 font-semibold" : "text-orange-600 font-semibold"}
          >
            {business.status === "active" ? "Active" : "Suspendue (inscriptions, scans et notifications bloqués)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/entreprises/${id}/kit`} className="btn btn-primary">
            Kit de lancement (QR à imprimer)
          </Link>
          {business.status === "active" ? (
            <ConfirmButton
              label="Suspendre"
              confirmLabel="Oui, suspendre"
              onConfirm={setBusinessStatus.bind(null, id, "suspended")}
            />
          ) : (
            <ConfirmButton
              label="Réactiver"
              confirmLabel="Oui, réactiver"
              variant="primary"
              onConfirm={setBusinessStatus.bind(null, id, "active")}
            />
          )}
        </div>
      </div>

      {cree && (
        <p className="alert-ok">
          Entreprise et carte créées ✓ Étape suivante : crée un accès commerçant plus bas, puis ouvre le kit de
          lancement.
        </p>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="panel">
            <div className="text-3xl font-bold tabular-nums">{s.value}</div>
            <div className="text-sm text-gray-600">{s.label}</div>
          </div>
        ))}
      </section>
      <p className="text-sm text-gray-600 -mt-5">
        Cartes : {byPlatform("apple")} Apple Wallet · {byPlatform("google")} Google Wallet · {byPlatform("web")} carte
        web
      </p>

      <section className="panel space-y-3">
        <h2 className="text-xl font-bold">Lien d&apos;inscription des clients</h2>
        <p className="text-sm text-gray-600">C&apos;est l&apos;adresse du QR code affiché sur le comptoir.</p>
        <CopyField value={signupUrl} />
      </section>

      <section className="panel space-y-4" id="acces">
        <h2 className="text-xl font-bold">Accès commerçant (scanner, notifications, clients)</h2>
        <p className="text-sm text-gray-600">
          Donne au commerçant le lien et le code PIN. Il ouvre le lien sur son téléphone, tape le PIN, et peut scanner
          les cartes. Après 5 PIN faux, l&apos;accès se bloque : tu peux le débloquer ici.
        </p>
        {accesses.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {accesses.map((a) => (
              <li key={a.id} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {a.label}{" "}
                    <span className={a.is_active ? "text-green-700 text-sm" : "text-orange-600 text-sm"}>
                      {a.is_active ? "actif" : "désactivé"}
                    </span>
                    {a.failed_attempts >= 5 && <span className="text-red-700 text-sm"> · bloqué (5 PIN faux)</span>}
                  </span>
                  <span className="text-xs text-gray-500">Dernière utilisation : {formatDateTime(a.last_used_at)}</span>
                </div>
                <CopyField value={`${appUrl()}/m/${a.access_token}`} />
                <div className="flex flex-wrap gap-2">
                  {a.failed_attempts > 0 && (
                    <ConfirmButton
                      label="Débloquer"
                      variant="secondary"
                      confirmLabel="Oui, débloquer"
                      onConfirm={updateAccess.bind(null, id, a.id, { failed_attempts: 0 })}
                    />
                  )}
                  <ConfirmButton
                    label={a.is_active ? "Désactiver" : "Activer"}
                    variant="secondary"
                    confirmLabel="Confirmer"
                    onConfirm={updateAccess.bind(null, id, a.id, { is_active: !a.is_active })}
                  />
                  <ConfirmButton
                    label={a.can_send_notifications ? "Interdire les notifications" : "Autoriser les notifications"}
                    variant="secondary"
                    confirmLabel="Confirmer"
                    onConfirm={updateAccess.bind(null, id, a.id, { can_send_notifications: !a.can_send_notifications })}
                  />
                  <ConfirmButton
                    label="Supprimer"
                    confirmLabel="Oui, supprimer"
                    onConfirm={deleteAccess.bind(null, id, a.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <AccessForm businessId={id} />
      </section>

      <section className="panel space-y-4" id="notifications">
        <h2 className="text-xl font-bold">Notifications</h2>
        <NotificationForm businessName={business.name} onSubmit={adminCreateNotification.bind(null, id)} />
        {notifications.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="pr-3">Message</th>
                  <th className="pr-3">Statut</th>
                  <th className="pr-3">Reçue par</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {notifications.map((n) => (
                  <tr key={n.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(n.send_at)}</td>
                    <td className="pr-3">
                      {n.message}
                      {n.repeat_every_days ? (
                        <span className="text-gray-500"> (tous les {n.repeat_every_days} j)</span>
                      ) : null}
                    </td>
                    <td className="pr-3 whitespace-nowrap">
                      {STATUS_LABELS[n.status]}
                      {n.created_by === "admin" ? " · toi" : " · commerçant"}
                    </td>
                    <td className="pr-3 tabular-nums">{n.recipients_count ?? "—"}</td>
                    <td>
                      {n.status === "scheduled" && (
                        <ConfirmButton
                          label="Annuler"
                          confirmLabel="Oui, annuler"
                          onConfirm={adminCancelNotification.bind(null, id, n.id)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4" id="carte">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Design et règles de la carte</h2>
          {program &&
            (program.is_active ? (
              <ConfirmButton
                label="Mettre la carte en pause"
                confirmLabel="Oui, pause"
                onConfirm={setProgramActive.bind(null, id, false)}
              />
            ) : (
              <ConfirmButton
                label="Réactiver la carte"
                variant="primary"
                confirmLabel="Oui, réactiver"
                onConfirm={setProgramActive.bind(null, id, true)}
              />
            ))}
        </div>
        <BusinessForm business={business} program={program ?? undefined} />
      </section>

      <section className="panel space-y-4" id="clients">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Clients</h2>
          <a href={`/admin/entreprises/${id}/export`} className="btn btn-secondary text-sm">
            Exporter en CSV (Excel)
          </a>
        </div>
        <form className="flex gap-2">
          <input name="q" defaultValue={q ?? ""} className="input" placeholder="Rechercher un nom, email, téléphone" />
          <button className="btn btn-secondary">Rechercher</button>
        </form>
        {customers.length === 0 ? (
          <p className="text-gray-600">Aucun client {q ? "trouvé" : "pour le moment"}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2 pr-3">Client</th>
                  <th className="pr-3">Contact</th>
                  <th className="pr-3">Tampons</th>
                  <th className="pr-3">Offres</th>
                  <th className="pr-3">Dernière visite</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3">
                      {c.first_name} {c.last_name ?? ""}
                      <div className="text-xs text-gray-500">
                        {c.cards?.[0]?.wallet_platform ?? "carte non ajoutée"}
                      </div>
                    </td>
                    <td className="pr-3">
                      {c.email ?? ""}
                      <div>{c.phone ?? ""}</div>
                    </td>
                    <td className="pr-3 tabular-nums">
                      {c.cards?.[0]?.stamps_count ?? 0}/{program?.reward_threshold ?? "?"}
                    </td>
                    <td className="pr-3">{c.marketing_optin ? "Oui" : "Non"}</td>
                    <td className="pr-3 whitespace-nowrap">{formatDateTime(c.last_visit_at)}</td>
                    <td className="whitespace-nowrap space-x-2">
                      <a href={`/admin/clients/${c.id}/export`} className="underline text-sm">
                        Données
                      </a>
                      <ConfirmButton
                        label="Supprimer"
                        confirmLabel="Supprimer définitivement"
                        onConfirm={deleteCustomer.bind(null, id, c.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
