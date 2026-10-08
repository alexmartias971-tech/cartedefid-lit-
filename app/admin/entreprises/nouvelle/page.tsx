import Link from "next/link";
import BusinessForm from "@/components/BusinessForm";
import { requireAdmin } from "@/lib/admin-auth";

export default async function NouvelleEntreprise() {
  await requireAdmin();
  return (
    <div className="space-y-3">
      <Link href="/admin" className="text-sm underline text-gray-600">
        ← Mes entreprises
      </Link>
      <BusinessForm />
    </div>
  );
}
