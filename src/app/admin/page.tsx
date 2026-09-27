import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { formatDate } from "@/lib/format";

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const { data: entreprises, error } = await supabase
    .from("businesses")
    .select("id, name, slug, status, created_at, logo_url, customers(count)")
    .order("created_at", { ascending: false });

  if (error) return <p className="alert-error">Erreur : {error.message}</p>;

  type Row = { id: string; name: string; status: string; created_at: string; customers: { count: number }[] };
  const rows = (entreprises ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Mes entreprises clientes</h1>
        <Link href="/admin/entreprises/nouvelle" className="btn btn-primary">
          + Nouvelle entreprise
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="panel text-center space-y-3">
          <p>Aucune entreprise pour le moment.</p>
          <Link href="/admin/entreprises/nouvelle" className="btn btn-primary">
            Créer ma première carte
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/entreprises/${e.id}`}
                className="panel flex flex-wrap items-center justify-between gap-2 hover:border-[var(--lagon)]"
              >
                <span>
                  <span className="font-semibold text-lg">{e.name}</span>
                  <span className="block text-sm text-gray-500">Créée le {formatDate(e.created_at)}</span>
                </span>
                <span className="flex items-center gap-4 text-sm">
                  <span className="tabular-nums">{e.customers?.[0]?.count ?? 0} client(s)</span>
                  <span
                    className={e.status === "active" ? "text-green-700 font-semibold" : "text-orange-600 font-semibold"}
                  >
                    {e.status === "active" ? "Active" : "Suspendue"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
