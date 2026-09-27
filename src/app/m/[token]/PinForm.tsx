"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PinForm({
  token,
  businessName,
  logoUrl,
}: {
  token: string;
  businessName: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    const res = await fetch("/api/merchant/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, pin }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Erreur réseau." }));
    setPending(false);
    if (!data.ok) {
      setError(data.error ?? "Code PIN incorrect.");
      setPin("");
      return;
    }
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <form onSubmit={submit} className="panel w-full max-w-xs space-y-4 text-center">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mx-auto h-16 w-16 object-contain" />
        )}
        <h1 className="text-xl font-bold">{businessName}</h1>
        <p className="text-sm text-gray-600">Espace commerçant</p>
        <label htmlFor="pin" className="label">
          Code PIN
        </label>
        <input
          id="pin"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{4,8}"
          required
          autoFocus
          className="input text-center text-2xl tracking-[0.5em]"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
        />
        {error && <p className="alert-error text-sm">{error}</p>}
        <button type="submit" disabled={pending || pin.length < 4} className="btn btn-primary w-full">
          {pending ? "Vérification..." : "Entrer"}
        </button>
      </form>
    </main>
  );
}
