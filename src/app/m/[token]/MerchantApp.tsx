"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationForm, { type NotificationSubmit } from "@/components/NotificationForm";

type Tab = "scan" | "notif" | "clients";
type CardInfo = {
  first_name: string;
  last_name: string | null;
  mode: "stamps" | "points" | "cashback";
  balance_label: string;
  balance_value: string;
  stamps: { filled: number; total: number } | null;
  sentence: string;
  reward: string;
  reward_ready: boolean;
  points: number;
  cashback: number;
  points_per_euro: number;
  cashback_percent: number;
  tier: { name: string; perk: string | null } | null;
  next_tier: { name: string; remaining: string } | null;
  coupons: { id: string; title: string; expires_at: string | null }[];
  catalog: { id: string; name: string; cost: number; affordable: boolean }[];
  lap_enabled: boolean;
  best_lap: string | null;
  rank: { pos: number; total: number } | null;
  streak: { count: number; goal: number; thisWeek: boolean } | null;
};

/** "38,412" / "38.412" / "1:02.345" → millisecondes */
function parseLap(text: string): number | null {
  const t = text.trim().replace(",", ".");
  const m = /^(?:(\d{1,2}):)?(\d{1,3})(?:\.(\d{1,3}))?$/.exec(t);
  if (!m) return null;
  const ms = (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 + Number((m[3] ?? "0").padEnd(3, "0"));
  return ms > 0 ? ms : null;
}
type Html5QrcodeInstance = {
  start: (...a: unknown[]) => Promise<unknown>;
  stop: () => Promise<void>;
  isScanning: boolean;
};

const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("fr-FR", {
        timeZone: "America/Guadeloupe",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso))
    : "—";

async function api<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T & { ok: boolean; error?: string }> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  return res.json().catch(() => ({ ok: false, error: "Erreur réseau. Vérifie ta connexion." }));
}

export default function MerchantApp(props: {
  businessName: string;
  accessLabel: string;
  canNotify: boolean;
  threshold: number;
  reward: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("scan");

  async function logout() {
    await fetch("/api/merchant/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="flex-1 w-full max-w-md mx-auto flex flex-col">
      <header className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg leading-tight">{props.businessName}</h1>
          <p className="text-xs text-gray-500">{props.accessLabel}</p>
        </div>
        <button onClick={logout} className="text-sm underline text-gray-600">
          Quitter
        </button>
      </header>

      <nav className="grid grid-cols-3 gap-2 px-4 py-2 sticky top-0 bg-[var(--fond)] z-10">
        {(
          [
            ["scan", "📷 Scanner"],
            ["notif", "🔔 Notifier"],
            ["clients", "👥 Clients"],
          ] as const
        ).map(([key, label]) =>
          key === "notif" && !props.canNotify ? null : (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`btn text-sm ${tab === key ? "btn-primary" : "btn-secondary"}`}
            >
              {label}
            </button>
          ),
        )}
      </nav>

      <div className="p-4 flex-1">
        {tab === "scan" && <Scanner />}
        {tab === "notif" && props.canNotify && <Notifications businessName={props.businessName} />}
        {tab === "clients" && <Clients />}
      </div>
    </div>
  );
}

/* ---------------------------------- SCANNER ---------------------------------- */
const euro = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);

function Scanner() {
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const [scanning, setScanning] = useState(false);
  const [serial, setSerial] = useState<string | null>(null);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [useAmount, setUseAmount] = useState("");
  const [lap, setLap] = useState("");
  const [confirm, setConfirm] = useState<{ label: string; run: () => void } | null>(null);

  const stopCamera = useCallback(async () => {
    const s = scannerRef.current;
    if (s?.isScanning) await s.stop().catch(() => {});
    setScanning(false);
  }, []);

  useEffect(
    () => () => {
      void stopCamera();
    },
    [stopCamera],
  );

  async function send(action: string, extra: Record<string, unknown> = {}, value?: string) {
    const target = value ?? serial;
    if (!target) return;
    setBusy(true);
    setConfirm(null);
    const res = await api<CardInfo & { done?: string }>("/api/merchant/scan", {
      method: "POST",
      body: JSON.stringify({ serial: target, action, ...extra }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.error ?? "Action impossible." });
      if (action === "lookup") setSerial(null);
      return;
    }
    setSerial(target);
    setCard(res);
    if (action === "lookup") return;
    setMessage({ ok: true, text: res.done ?? "C'est enregistré ✓" });
    setCanUndo(action === "stamp" || action === "purchase");
    setAmount("");
    setUseAmount("");
  }

  async function startCamera() {
    setMessage(null);
    setCard(null);
    setSerial(null);
    setCanUndo(false);
    setConfirm(null);
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("lecteur-qr") as unknown as Html5QrcodeInstance;
    scannerRef.current = scanner;
    setScanning(true);
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (text: string) => {
          await stopCamera();
          await send("lookup", {}, text.trim());
        },
        () => {},
      );
    } catch {
      setScanning(false);
      setMessage({
        ok: false,
        text: "Impossible d'ouvrir la caméra. Autorise l'accès à la caméra dans les réglages du navigateur.",
      });
    }
  }

  const amountNum = Number(amount.replace(",", ".")) || 0;
  const preview =
    card?.mode === "points"
      ? `+${Math.floor(amountNum * card.points_per_euro)} points`
      : card?.mode === "cashback"
        ? `+${euro(Math.round(amountNum * card.cashback_percent) / 100)} sur la cagnotte`
        : "";

  return (
    <div className="space-y-4">
      <div id="lecteur-qr" className={`rounded-2xl overflow-hidden bg-black ${scanning ? "" : "hidden"}`} />

      {!scanning && !card && (
        <button onClick={startCamera} className="btn btn-primary w-full text-xl py-6">
          📷 Scanner une carte
        </button>
      )}
      {scanning && (
        <button onClick={stopCamera} className="btn btn-secondary w-full">
          Arrêter la caméra
        </button>
      )}
      {busy && <p className="text-center text-gray-600">Un instant…</p>}

      {card && (
        <div className="panel space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold">
              {card.first_name} {card.last_name ?? ""}
            </p>
            {card.tier && (
              <p className="text-sm font-semibold text-[var(--lagon)]">
                Niveau {card.tier.name}
                {card.tier.perk ? ` : ${card.tier.perk}` : ""}
              </p>
            )}
            <p className="mt-2 text-xs font-semibold tracking-wider text-gray-500">{card.balance_label}</p>
            <p className="text-4xl font-extrabold tabular-nums">{card.balance_value}</p>
            {card.streak && (
              <p className="mt-1 text-sm font-semibold">
                🔥 Série : {card.streak.count} semaine{card.streak.count > 1 ? "s" : ""}
                {card.streak.thisWeek ? " (déjà venu cette semaine)" : ""}
              </p>
            )}
            {card.lap_enabled && (
              <p className="text-sm">
                ⏱️ Record : {card.best_lap ?? "aucun pour l'instant"}
                {card.rank ? ` · 🏆 P${card.rank.pos} / ${card.rank.total}` : ""}
              </p>
            )}
            {card.stamps && (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {Array.from({ length: card.stamps.total }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-5 w-5 rounded-full border-2 border-[var(--lagon)] ${i < card.stamps!.filled ? "bg-[var(--lagon)]" : ""}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Tampons */}
          {card.mode === "stamps" &&
            (card.reward_ready ? (
              <>
                <p className="alert-ok font-semibold text-center">🎁 Cadeau débloqué : {card.reward}</p>
                <button disabled={busy} onClick={() => send("redeem")} className="btn btn-primary w-full text-lg py-4">
                  J&apos;ai remis le cadeau : valider
                </button>
              </>
            ) : (
              <button disabled={busy} onClick={() => send("stamp")} className="btn btn-primary w-full text-lg py-4">
                + Ajouter 1 tampon
              </button>
            ))}

          {/* Points et cashback : saisir l'achat */}
          {card.mode !== "stamps" && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (amountNum <= 0) return;
                setConfirm({ label: `Enregistrer un achat de ${euro(amountNum)} (${preview}) ?`, run: () => send("purchase", { amount: amountNum }) });
              }}
            >
              <label htmlFor="achat" className="label">Montant de l&apos;achat (€)</label>
              <div className="flex gap-2">
                <input id="achat" inputMode="decimal" className="input text-xl" value={amount} placeholder="12,50"
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
                <button type="submit" disabled={busy || amountNum <= 0} className="btn btn-primary shrink-0">Valider</button>
              </div>
              {amountNum > 0 && <p className="hint">{preview}</p>}
            </form>
          )}

          {/* Catalogue de cadeaux (points) */}
          {card.mode === "points" && card.catalog.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold">Échanger des points</p>
              {card.catalog.map((r) => (
                <button key={r.id} disabled={busy || !r.affordable}
                  onClick={() => setConfirm({ label: `Échanger ${r.cost} points contre « ${r.name} » ?`, run: () => send("reward", { reward_id: r.id }) })}
                  className={`btn w-full justify-between ${r.affordable ? "btn-secondary" : "btn-secondary opacity-50"}`}>
                  <span>{r.name}</span>
                  <span className="tabular-nums">{r.cost} pts</span>
                </button>
              ))}
            </div>
          )}

          {/* Cagnotte (cashback) */}
          {card.mode === "cashback" && card.cashback > 0 && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(useAmount.replace(",", ".")) || 0;
                if (n <= 0) return;
                setConfirm({ label: `Déduire ${euro(n)} de la cagnotte (${euro(card.cashback)} disponibles) ?`, run: () => send("cashback", { amount: n }) });
              }}
            >
              <label htmlFor="cagnotte" className="label">Utiliser la cagnotte (max {euro(card.cashback)})</label>
              <div className="flex gap-2">
                <input id="cagnotte" inputMode="decimal" className="input" value={useAmount} placeholder={String(card.cashback).replace(".", ",")}
                  onChange={(e) => setUseAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
                <button type="submit" disabled={busy} className="btn btn-secondary shrink-0">Déduire</button>
              </div>
            </form>
          )}

          {/* Record personnel (chrono) */}
          {card.lap_enabled && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const ms = parseLap(lap);
                if (!ms) {
                  setMessage({ ok: false, text: "Temps invalide. Exemple : 38,412 ou 1:02,345" });
                  return;
                }
                void send("lap", { lap_ms: ms });
                setLap("");
              }}
            >
              <label htmlFor="chrono" className="label">⏱️ Meilleur tour de la session (secondes)</label>
              <div className="flex gap-2">
                <input id="chrono" inputMode="decimal" className="input text-xl" value={lap} placeholder="38,412"
                  onChange={(e) => setLap(e.target.value.replace(/[^\d.,:]/g, ""))} />
                <button type="submit" disabled={busy || !lap} className="btn btn-secondary shrink-0">Enregistrer</button>
              </div>
              <p className="hint">Si c&apos;est son meilleur temps, sa carte se met à jour et il reçoit une notification.</p>
            </form>
          )}

          {/* Offres */}
          {card.coupons.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold">🎁 Offres disponibles</p>
              {card.coupons.map((c) => (
                <button key={c.id} disabled={busy}
                  onClick={() => setConfirm({ label: `Valider l'offre « ${c.title} » ?`, run: () => send("coupon", { coupon_id: c.id }) })}
                  className="btn btn-secondary w-full justify-between text-left">
                  <span>{c.title}</span>
                  <span className="text-sm text-[var(--lagon)]">Utiliser</span>
                </button>
              ))}
            </div>
          )}

          {confirm && (
            <div className="rounded-xl border-2 border-[var(--lagon)] p-3 space-y-2">
              <p className="font-semibold">{confirm.label}</p>
              <div className="flex gap-2">
                <button disabled={busy} onClick={confirm.run} className="btn btn-primary flex-1">Oui, valider</button>
                <button onClick={() => setConfirm(null)} className="btn btn-secondary flex-1">Annuler</button>
              </div>
            </div>
          )}

          {canUndo && (
            <button disabled={busy} onClick={() => send("undo")} className="btn btn-danger w-full">
              Annuler le dernier passage
            </button>
          )}
          {card.next_tier && (
            <p className="hint text-center">Niveau {card.next_tier.name} dans {card.next_tier.remaining}.</p>
          )}
        </div>
      )}

      {message && <p className={message.ok ? "alert-ok text-center" : "alert-error text-center"}>{message.text}</p>}
      {(card || message) && !scanning && (
        <button onClick={startCamera} className="btn btn-secondary w-full">
          📷 Client suivant
        </button>
      )}
    </div>
  );
}

/* ------------------------------- NOTIFICATIONS ------------------------------- */
type NotifRow = {
  id: string;
  message: string;
  status: string;
  send_at: string;
  repeat_every_days: number | null;
  recipients_count: number | null;
};
const STATUS: Record<string, string> = {
  scheduled: "Programmée",
  sending: "En cours",
  sent: "Envoyée",
  cancelled: "Annulée",
  failed: "Échec",
  skipped: "Sautée (limite)",
};

function Notifications({ businessName }: { businessName: string }) {
  const [list, setList] = useState<NotifRow[]>([]);
  const [remaining, setRemaining] = useState<number | undefined>(undefined);

  const load = useCallback(() => {
    return api<{ notifications: NotifRow[]; remaining: number }>("/api/merchant/notifications").then((res) => {
      if (res.ok) {
        setList(res.notifications);
        setRemaining(res.remaining);
      }
    });
  }, []);
  useEffect(() => {
    api<{ notifications: NotifRow[]; remaining: number }>("/api/merchant/notifications").then((res) => {
      if (res.ok) {
        setList(res.notifications);
        setRemaining(res.remaining);
      }
    });
  }, []);

  async function submit(p: NotificationSubmit) {
    const res = await api<{ sentNow?: boolean }>("/api/merchant/notifications", {
      method: "POST",
      body: JSON.stringify(p),
    });
    await load();
    return res;
  }

  async function cancel(id: string) {
    await api(`/api/merchant/notifications?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="panel">
        <NotificationForm businessName={businessName} onSubmit={submit} remainingThisWeek={remaining} />
      </div>
      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id} className="panel py-3 text-sm space-y-1">
              <div className="flex justify-between gap-2 text-gray-500">
                <span>
                  {fmt(n.send_at)}
                  {n.repeat_every_days ? ` · tous les ${n.repeat_every_days} j` : ""}
                </span>
                <span>
                  {STATUS[n.status] ?? n.status}
                  {n.recipients_count !== null ? ` · ${n.recipients_count} clients` : ""}
                </span>
              </div>
              <p>{n.message}</p>
              {n.status === "scheduled" && (
                <button onClick={() => cancel(n.id)} className="text-red-700 underline">
                  Annuler
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------- CLIENTS ---------------------------------- */
type ClientRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  last_visit_at: string | null;
  marketing_optin: boolean;
  balance: string;
  tier: string | null;
};

function Clients() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [stats, setStats] = useState<{ total: number; stampsThisMonth: number; rewardsRedeemed: number } | null>(null);

  const load = useCallback((search: string) => {
    return api<{ customers: ClientRow[]; stats: typeof stats }>(
      `/api/merchant/customers?q=${encodeURIComponent(search)}`,
    ).then((res) => {
      if (res.ok) {
        setRows(res.customers);
        setStats(res.stats);
      }
    });
  }, []);
  useEffect(() => {
    api<{ customers: ClientRow[]; stats: typeof stats }>("/api/merchant/customers?q=").then((res) => {
      if (res.ok) {
        setRows(res.customers);
        setStats(res.stats);
      }
    });
  }, []);

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Clients", stats.total],
            ["Passages ce mois", stats.stampsThisMonth],
            ["Récompenses utilisées", stats.rewardsRedeemed],
          ].map(([l, v]) => (
            <div key={String(l)} className="panel p-3">
              <div className="text-2xl font-bold tabular-nums">{v}</div>
              <div className="text-xs text-gray-600">{l}</div>
            </div>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(q);
        }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input" placeholder="Rechercher un client" />
        <button className="btn btn-secondary">OK</button>
      </form>
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id} className="panel py-3 flex justify-between gap-3 text-sm">
            <span>
              <span className="font-semibold">
                {c.first_name} {c.last_name ?? ""}
              </span>
              <span className="block text-gray-500">{c.phone ?? c.email ?? ""}</span>
            </span>
            <span className="text-right">
              <span className="font-semibold tabular-nums">
                {c.balance}
                {c.tier ? ` · ${c.tier}` : ""}
              </span>
              <span className="block text-gray-500">{fmt(c.last_visit_at)}</span>
            </span>
          </li>
        ))}
        {rows.length === 0 && <p className="text-gray-600 text-center">Aucun client.</p>}
      </ul>
    </div>
  );
}
