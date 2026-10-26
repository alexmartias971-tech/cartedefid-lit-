"use client";

import { useEffect, useState } from "react";

/**
 * Le ticket est après « # » dans l'adresse : jamais envoyé au serveur par le navigateur, ni lu par les aperçus de liens.
 * Il est effacé de l'adresse tout de suite, envoyé en POST à /api/merchant/entree, puis on ouvre la caisse.
 */
export default function EntreeCaisse() {
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    const jeton = /(?:^|[#&])jeton=([A-Za-z0-9_-]{40,64})(?![A-Za-z0-9_-])/.exec(window.location.hash)?.[1] ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    const fini = (message: string) => {
      setErreur(message);
    };
    if (!jeton) {
      Promise.resolve().then(() => fini("Ce lien d'entrée est incomplet : rouvre-le depuis le CRM."));
      return;
    }
    fetch("/api/merchant/entree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jeton, cible: "caisse" }),
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((r) => r.json().catch(() => ({ ok: false })))
      .then((r: { ok?: boolean; error?: string; vers?: string }) => {
        if (r.ok && r.vers && /^\/m\/[0-9a-f]{48}$/.test(r.vers)) window.location.replace(r.vers);
        else fini(r.error || "Ce lien d'entrée ne marche plus : rouvre-le depuis le CRM.");
      })
      .catch(() => fini("Pas de connexion internet : réessaie depuis le CRM."));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 420, margin: "15vh auto", padding: "0 20px", color: "#1d1726", textAlign: "center" }}>
      <h1 style={{ fontSize: 22 }}>Entrée Walty</h1>
      <p style={{ fontSize: 17, lineHeight: 1.5 }}>{erreur || "Ouverture de la caisse…"}</p>
    </main>
  );
}
