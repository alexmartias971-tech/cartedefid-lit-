import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { isAppleConfigured, isGoogleConfigured } from "@/lib/env";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const apple = isAppleConfigured();
  const google = isGoogleConfigured();

  return (
    <div className="flex-1">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-5 font-medium">
          <Link href="/admin">Mes entreprises</Link>
          <Link href="/admin/entreprises/nouvelle">+ Nouvelle entreprise</Link>
        </nav>
        <div className="flex items-center gap-3 text-xs">
          <span className={apple ? "text-green-700" : "text-orange-600"}>
            Apple Wallet {apple ? "✓" : "non configuré"}
          </span>
          <span className={google ? "text-green-700" : "text-orange-600"}>
            Google Wallet {google ? "✓" : "non configuré"}
          </span>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-gray-600 hover:text-black underline">Se déconnecter</button>
          </form>
        </div>
      </header>
      <main className="p-4 sm:p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
