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

/**
 * Android, page ouverte dans le navigateur d'une appli (Instagram, Facebook, TikTok…) : Google y refuse la connexion,
 * la carte ne s'ajouterait pas. Ce lien rouvre le même bouton dans Chrome (ou, sans Chrome, dans le navigateur du téléphone).
 */
function viaChrome(base: string, path: string): string {
  const url = `${base}${path}`;
  return `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

function Badge({ kind, token, href }: { kind: keyof typeof BADGES; token: string; href?: string }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Le badge a pu échouer avant que la page soit prête : on vérifie une fois au chargement
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setBroken(true);
  }, []);
  const b = BADGES[kind];
  return (
    <a href={href ?? b.href(token)} className="wc-badge-link" aria-label={b.label}>
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
  inApp = null,
  base = "",
}: {
  token: string;
  showApple: boolean;
  showGoogle: boolean;
  /** Page ouverte dans le navigateur d'une appli (Instagram, Facebook, TikTok…), sur Android ou sur iPhone. */
  inApp?: "android" | "ios" | null;
  /** Adresse publique du site (pour rouvrir le bouton Google dans Chrome). */
  base?: string;
}) {
  const solo = showApple !== showGoogle;
  const googleHref = inApp === "android" && base ? viaChrome(base, BADGES.google.href(token)) : undefined;
  return (
    <>
      <div className={`wc-badges ${solo ? "wc-badges-solo" : ""}`}>
        {showApple && <Badge kind="apple" token={token} />}
        {showGoogle && <Badge kind="google" token={token} href={googleHref} />}
      </div>
      {inApp === "android" && (
        <p className="wc-inapp">Rien ne s&apos;ouvre ? Touche ⋮ en haut à droite, puis « Ouvrir dans Chrome ».</p>
      )}
      {inApp === "ios" && (
        <p className="wc-inapp">Rien ne s&apos;ouvre ? Touche ⋯ en haut de l&apos;écran, puis « Ouvrir dans Safari ».</p>
      )}
    </>
  );
}
