"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Boutons « Ajouter à Apple Wallet » / « Ajouter à Google Wallet ».
 * Ce sont les BADGES OFFICIELS d'Apple et de Google (fichiers dans /public/badges/, les mêmes que sur walty.fr),
 * affichés sans modification : ne pas les recolorer, déformer ni redessiner (règles des deux marques).
 * Si un fichier de badge manque, un bouton noir avec le même texte le remplace, pour ne jamais bloquer le client.
 * Les liens (/api/wallet/apple/… et /api/wallet/google/…) ne changent pas.
 */
const BADGES = {
  apple: { src: "/badges/apple-wallet.svg", label: "Ajouter à Apple Wallet", href: (t: string) => `/api/wallet/apple/${t}` },
  google: { src: "/badges/google-wallet.svg", label: "Ajouter à Google Wallet", href: (t: string) => `/api/wallet/google/${t}` },
} as const;

function Badge({ kind, token }: { kind: keyof typeof BADGES; token: string }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Le badge a pu échouer avant que la page soit prête : on vérifie une fois au chargement
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setBroken(true);
  }, []);
  const b = BADGES[kind];
  return (
    <a href={b.href(token)} className="wc-badge-link" aria-label={b.label}>
      {broken ? (
        <span className="wc-badge-text">{b.label}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={img} src={b.src} alt={b.label} className="wc-badge" onError={() => setBroken(true)} />
      )}
    </a>
  );
}

export default function WalletButtons({
  token,
  showApple,
  showGoogle,
}: {
  token: string;
  showApple: boolean;
  showGoogle: boolean;
}) {
  const solo = showApple !== showGoogle;
  return (
    <div className={`wc-badges ${solo ? "wc-badges-solo" : ""}`}>
      {showApple && <Badge kind="apple" token={token} />}
      {showGoogle && <Badge kind="google" token={token} />}
    </div>
  );
}
