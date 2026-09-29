/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { formatLap } from "@/lib/card-state";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Classement" };

type Row = { rank: number; pilot: string; best_lap_ms: number; tier: string | null };

/** Classement public des meilleurs tours (prénom + initiale seulement pour ceux qui l'ont accepté). */
export default async function LeaderboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("name, logo_url, status, loyalty_programs(background_color, foreground_color, stamp_color, label_color, lap_times_enabled)")
    .eq("slug", slug)
    .maybeSingle();
  const program = (business?.loyalty_programs as unknown as {
    background_color: string;
    foreground_color: string;
    stamp_color: string;
    label_color: string;
    lap_times_enabled: boolean;
  } | null) ?? null;
  if (!business || business.status !== "active" || !program?.lap_times_enabled) notFound();

  const { data } = await supabase.rpc("lap_leaderboard", { p_slug: slug, p_limit: 30 });
  const rows = (data ?? []) as Row[];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const accent = program.stamp_color;

  return (
    <main className="flex-1 min-h-screen" style={{ background: program.background_color, color: program.foreground_color }}>
      <div className="mx-auto max-w-md p-5 space-y-6">
        <header className="flex items-center gap-3">
          {business.logo_url && <img src={business.logo_url} alt="" className="h-12 w-12 object-contain" />}
          <div>
            <p className="text-xs font-bold tracking-widest" style={{ color: program.label_color }}>CLASSEMENT DES MEILLEURS TOURS</p>
            <h1 className="text-2xl font-black italic">{business.name}</h1>
          </div>
        </header>

        {rows.length === 0 ? (
          <p className="opacity-80">Aucun temps enregistré pour le moment. Sois le premier ! 🏁</p>
        ) : (
          <>
            <div className="grid grid-cols-3 items-end gap-2 text-center">
              {[podium[1], podium[0], podium[2]].map((r, i) =>
                r ? (
                  <div key={r.rank} className="rounded-2xl p-3" style={{ background: i === 1 ? accent : "rgba(255,255,255,.08)", color: i === 1 ? "#111" : undefined, paddingTop: i === 1 ? 28 : 16 }}>
                    <div className="text-3xl font-black italic">P{r.rank}</div>
                    <div className="font-semibold truncate">{r.pilot}</div>
                    <div className="tabular-nums text-sm opacity-90">{formatLap(r.best_lap_ms)}</div>
                  </div>
                ) : (
                  <div key={i} />
                ),
              )}
            </div>
            <ol className="space-y-1.5">
              {rest.map((r) => (
                <li key={r.rank} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.06)" }}>
                  <span className="w-10 font-black italic" style={{ color: accent }}>P{r.rank}</span>
                  <span className="flex-1 truncate">{r.pilot}</span>
                  {r.tier && <span className="text-xs opacity-70">{r.tier}</span>}
                  <span className="tabular-nums font-semibold">{formatLap(r.best_lap_ms)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="text-xs opacity-60">Temps enregistrés par l&apos;équipe après chaque session. Ton rang s&apos;affiche aussi sur ta carte.</p>
      </div>
    </main>
  );
}
