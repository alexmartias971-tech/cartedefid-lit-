import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { isAppleConfigured, isGoogleConfigured } from "@/lib/env";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const apple = isAppleConfigured();
  const google = isGoogleConfigured();

  return (
    <div className="flex-1">
      <header className="bg-[#15262b] text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold">
            <Link href="/admin" className="mr-3 text-base font-black tracking-tight">
              🎟️ Carte<span className="text-[#7fd1db]">Fid</span>
            </Link>
            <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-white/10">Mes entreprises</Link>
            <Link href="/admin/entreprises/nouvelle" className="rounded-lg px-3 py-2 hover:bg-white/10">+ Nouvelle carte</Link>
            <Link href="/admin/guide" className="rounded-lg px-3 py-2 hover:bg-white/10">📘 Guide</Link>
          </nav>
          <div className="flex items-center gap-3 text-xs">
            <span className={`rounded-full px-2 py-1 ${apple ? "bg-green-500/20 text-green-200" : "bg-orange-500/20 text-orange-200"}`}>
              Apple Wallet {apple ? "✓" : "à configurer"}
            </span>
            <span className={`rounded-full px-2 py-1 ${google ? "bg-green-500/20 text-green-200" : "bg-orange-500/20 text-orange-200"}`}>
              Google Wallet {google ? "✓" : "à configurer"}
            </span>
            <form action="/auth/signout" method="post">
              <button className="text-white/70 hover:text-white underline">Se déconnecter</button>
            </form>
          </div>
        </div>
      </header>
      <main className="p-4 sm:p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
