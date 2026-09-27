"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationForm, { type NotificationSubmit } from "@/components/NotificationForm";

type Tab = "scan" | "notif" | "clients";
type CardInfo = {
  first_name: string;
  last_name: string | null;
  stamps: number;
  threshold: number;
  reward: string;
  reward_ready: boolean;
};
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
        {tab === "clients" && <Clients threshold={props.threshold} />}
      </div>
    </div>
  );
}

/* ---------------------------------- SCANNER ---------------------------------- */
function Scanner() {
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const [scanning, setScanning] = useState(false);
  const [serial, setSerial] = useState<string | null>(null);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState(false);

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

  async function lookup(value: string) {
    setBusy(true);
    const res = await api<CardInfo>("/api/merchant/scan", {
      method: "POST",
      body: JSON.stringify({ serial: value, action: "lookup" }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.error ?? "Carte non reconnue." });
      setSerial(null);
      return;
    }
    setSerial(value);
    setCard(res);
  }

  async function startCamera() {
    setMessage(null);
    setCard(null);
    setSerial(null);
    setCanUndo(false);
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
          await lookup(text.trim());
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

  async function act(action: "stamp" | "redeem" | "undo") {
    if (!serial) return;
    setBusy(true);
    const res = await api<{ stamps: number; threshold: number; reward_ready?: boolean }>("/api/merchant/scan", {
      method: "POST",
      body: JSON.stringify({ serial, action }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.error ?? "Action impossible." });
      return;
    }
    setCard((c) => (c ? { ...c, stamps: res.stamps, reward_ready: res.stamps >= res.threshold } : c));
    setCanUndo(action === "stamp");
    setMessage({
      ok: true,
      text:
        action === "stamp"
          ? res.reward_ready
            ? "Tampon ajouté ✓ 🎁 Cadeau débloqué !"
            : "Tampon ajouté ✓"
          : action === "redeem"
            ? "Cadeau validé ✓ Le compteur est remis à zéro."
            : "Tampon annulé.",
    });
  }

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
        <div className="panel space-y-3 text-center">
          <p className="text-2xl font-bold">
            {card.first_name} {card.last_name ?? ""}
          </p>
          <p className="text-4xl font-extrabold tabular-nums">
            {Math.min(card.stamps, card.threshold)}/{card.threshold}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: card.threshold }).map((_, i) => (
              <span
                key={i}
                className={`h-5 w-5 rounded-full border-2 border-[var(--lagon)] ${i < card.stamps ? "bg-[var(--lagon)]" : ""}`}
              />
            ))}
          </div>
          {card.reward_ready ? (
            <>
              <p className="alert-ok font-semibold">🎁 Cadeau débloqué : {card.reward}</p>
              <button disabled={busy} onClick={() => act("redeem")} className="btn btn-primary w-full text-lg py-4">
                J&apos;ai remis le cadeau : valider
              </button>
            </>
          ) : (
            <button disabled={busy} onClick={() => act("stamp")} className="btn btn-primary w-full text-lg py-4">
              + Ajouter 1 tampon
            </button>
          )}
          {canUndo && (
            <button disabled={busy} onClick={() => act("undo")} className="btn btn-danger w-full">
              Annuler ce tampon
            </button>
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
  cards: { stamps_count: number; rewards_redeemed: number }[];
};

function Clients({ threshold }: { threshold: number }) {
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
            ["Tampons ce mois", stats.stampsThisMonth],
            ["Cadeaux remis", stats.rewardsRedeemed],
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
                {c.cards?.[0]?.stamps_count ?? 0}/{threshold}
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
