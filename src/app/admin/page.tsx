/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/format";

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { data: entreprises, error } = await supabase
    .from("businesses")
    .select("id, name, slug, status, created_at, logo_url, customers(count), loyalty_programs(name, background_color, stamp_color, mode, progress_style)")
    .order("created_at", { ascending: false });

  if (error) return <p className="alert-error">Erreur : {error.message}</p>;

  type Row = {
    id: string;
    name: string;
    status: string;
    created_at: string;
    logo_url: string | null;
    customers: { count: number }[];
    loyalty_programs: { name: string; background_color: string; stamp_color: string } | null;
  };
  const rows = (entreprises ?? []) as unknown as Row[];
  const totalClients = rows.reduce((n, r) => n + (r.customers?.[0]?.count ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Mes entreprises clientes</h1>
          <p className="text-gray-600">
            {rows.length} carte{rows.length > 1 ? "s" : ""} · {totalClients} client{totalClients > 1 ? "s" : ""} inscrit{totalClients > 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/admin/entreprises/nouvelle" className="btn btn-primary">+ Nouvelle carte</Link>
      </div>

      <div className="rounded-2xl border border-[#cfe3e6] bg-[#eef6f7] p-4 text-sm flex flex-wrap items-center justify-between gap-2">
        <span>📘 Première fois ? Le guide explique chaque réglage et comment les cartes se mettent à jour toutes seules.</span>
        <Link href="/admin/guide" className="btn btn-secondary py-2">Ouvrir le guide</Link>
      </div>

      {rows.length === 0 ? (
        <div className="panel text-center space-y-3">
          <p>Aucune entreprise pour le moment.</p>
          <Link href="/admin/entreprises/nouvelle" className="btn btn-primary">Créer ma première carte</Link>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((e) => {
            const p = e.loyalty_programs;
            return (
              <li key={e.id}>
                <Link href={`/admin/entreprises/${e.id}`} className="block overflow-hidden rounded-2xl border border-[#dde7e5] bg-white hover:shadow-lg transition">
                  <div className="h-20 flex items-center gap-3 px-4" style={{ background: p?.background_color ?? "#15262b" }}>
                    {e.logo_url ? (
                      <img src={e.logo_url} alt="" className="h-12 w-12 rounded-lg object-contain bg-white/10" />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center rounded-lg bg-white/15 text-xl font-black text-white">{e.name[0]}</span>
                    )}
                    <span className="text-white font-bold leading-tight">{p?.name ?? "Carte"}</span>
                    <span className="ml-auto h-3 w-3 rounded-full" style={{ background: p?.stamp_color ?? "#fff" }} />
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-lg truncate">{e.name}</p>
                    <p className="text-sm text-gray-500">Créée le {formatDate(e.created_at)}</p>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="tabular-nums font-semibold">{e.customers?.[0]?.count ?? 0} client(s)</span>
                      <span className={e.status === "active" ? "text-green-700 font-semibold" : "text-orange-600 font-semibold"}>
                        {e.status === "active" ? "● Active" : "● Suspendue"}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
