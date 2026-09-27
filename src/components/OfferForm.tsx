"use client";

import { useState } from "react";

/** Formulaire "offre ponctuelle" : coupon ajouté sur toutes les cartes d'une entreprise. */
export default function OfferForm({
  onSubmit,
}: {
  onSubmit: (p: { title: string; days: number | null; notify: boolean }) => Promise<{ ok: boolean; error?: string; count?: number }>;
}) {
  const [title, setTitle] = useState("");
  const [days, setDays] = useState("14");
  const [notify, setNotify] = useState(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setResult(null);
        const res = await onSubmit({ title, days: Number(days) || null, notify });
        setPending(false);
        if (res.ok) {
          setResult({ ok: !res.error, text: res.error ?? `Offre ajoutée sur ${res.count} carte(s) ✓` });
          setTitle("");
        } else setResult({ ok: false, text: res.error ?? "Erreur" });
      }}
    >
      <div className="grid sm:grid-cols-[1fr_140px] gap-3">
        <div>
          <label htmlFor="offer-title" className="label">Offre</label>
          <input id="offer-title" className="input" maxLength={120} required value={title}
            onChange={(e) => setTitle(e.target.value)} placeholder="-20 % sur tout ce week-end" />
        </div>
        <div>
          <label htmlFor="offer-days" className="label">Valable (jours)</label>
          <input id="offer-days" type="number" min={1} max={365} className="input" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Prévenir par notification (compte dans la limite par semaine)
      </label>
      {result && <p className={result.ok ? "alert-ok" : "alert-error"}>{result.text}</p>}
      <button type="submit" disabled={pending || !title.trim()} className="btn btn-primary">
        {pending ? "Envoi..." : "Ajouter l'offre à toutes les cartes"}
      </button>
    </form>
  );
}
