"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    setChargement(true);
    setErreur("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setChargement(false);
    if (error) {
      setErreur("Email ou mot de passe incorrect.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <form onSubmit={seConnecter} className="panel w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Espace administrateur</h1>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input"
          />
        </div>
        {erreur && <p className="alert-error text-sm">{erreur}</p>}
        <button type="submit" disabled={chargement} className="btn btn-primary w-full">
          {chargement ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
