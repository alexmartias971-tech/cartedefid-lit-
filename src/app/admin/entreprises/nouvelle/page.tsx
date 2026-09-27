import BusinessForm from "@/components/BusinessForm";
import { requireAdmin } from "@/lib/admin-auth";

export default async function NouvelleEntreprise() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Nouvelle entreprise</h1>
      <BusinessForm />
    </div>
  );
}
