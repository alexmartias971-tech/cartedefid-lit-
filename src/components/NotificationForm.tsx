"use client";

import { useState } from "react";

export type NotificationSubmit = {
  message: string;
  when: "now" | "later";
  sendAt?: string;
  repeatEveryDays?: number | null;
  repeatUntil?: string | null;
};

/** Formulaire d'envoi de notification, utilisé par l'admin et par le commerçant. */
export default function NotificationForm({
  businessName,
  onSubmit,
  remainingThisWeek,
}: {
  businessName: string;
  onSubmit: (p: NotificationSubmit) => Promise<{ ok: boolean; error?: string; sentNow?: boolean }>;
  remainingThisWeek?: number;
}) {
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [sendAt, setSendAt] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [repeatEveryDays, setRepeatEveryDays] = useState(7);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const res = await onSubmit({
      message,
      when,
      sendAt: when === "later" ? sendAt : undefined,
      repeatEveryDays: when === "later" && repeat ? repeatEveryDays : null,
      repeatUntil: when === "later" && repeat && repeatUntil ? repeatUntil : null,
    });
    setPending(false);
    if (res.ok) {
      setResult({ ok: true, text: res.sentNow ? "Notification envoyée ✓" : "Notification programmée ✓" });
      setMessage("");
    } else {
      setResult({ ok: false, text: res.error ?? "Erreur" });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {typeof remainingThisWeek === "number" && (
        <p className="text-sm text-gray-600">
          Il te reste <strong>{remainingThisWeek}</strong> envoi(s) cette semaine (du lundi au dimanche).
        </p>
      )}
      <div>
        <label htmlFor="notif-message" className="label">
          Message (180 caractères max)
        </label>
        <textarea
          id="notif-message"
          rows={3}
          maxLength={180}
          required
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="-20 % sur les viennoiseries jusqu'à 18h !"
        />
        <p className="hint text-right tabular-nums">{message.length}/180</p>
      </div>

      {message && (
        <div
          className="rounded-2xl bg-gray-800/90 text-white p-3 text-sm shadow max-w-sm"
          aria-label="Aperçu de la notification"
        >
          <div className="text-xs opacity-70 mb-0.5">WALLET · maintenant</div>
          <div className="font-semibold">{businessName}</div>
          <div>{message}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2">
          <input type="radio" name="when" checked={when === "now"} onChange={() => setWhen("now")} /> Envoyer maintenant
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="radio" name="when" checked={when === "later"} onChange={() => setWhen("later")} /> Programmer
        </label>
      </div>

      {when === "later" && (
        <div className="space-y-3 rounded-xl bg-gray-50 p-3">
          <div>
            <label htmlFor="notif-date" className="label">
              Date et heure (heure de Guadeloupe)
            </label>
            <input
              id="notif-date"
              type="datetime-local"
              required
              className="input"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
            />
          </div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Répéter
          </label>
          {repeat && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="notif-every" className="label">
                  Tous les … jours
                </label>
                <input
                  id="notif-every"
                  type="number"
                  min={3}
                  max={60}
                  className="input"
                  value={repeatEveryDays}
                  onChange={(e) => setRepeatEveryDays(Number(e.target.value))}
                />
                <p className="hint">Minimum 3 jours.</p>
              </div>
              <div>
                <label htmlFor="notif-until" className="label">
                  Jusqu&apos;au (facultatif)
                </label>
                <input
                  id="notif-until"
                  type="datetime-local"
                  className="input"
                  value={repeatUntil}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <p className="hint">Envoyé uniquement aux clients qui ont accepté les offres à l&apos;inscription.</p>
      {result && <p className={result.ok ? "alert-ok" : "alert-error"}>{result.text}</p>}
      <button type="submit" disabled={pending || !message.trim()} className="btn btn-primary w-full sm:w-auto">
        {pending ? "Envoi..." : when === "now" ? "Envoyer la notification" : "Programmer la notification"}
      </button>
    </form>
  );
}
