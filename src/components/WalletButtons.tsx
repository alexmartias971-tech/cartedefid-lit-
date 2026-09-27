/**
 * Boutons "Ajouter à Apple Wallet" / "Ajouter à Google Wallet".
 * ⚠️ Avant de vendre : remplace ces boutons par les BADGES OFFICIELS d'Apple et de Google
 * (voir le guide, phase "Badges officiels"). Place les fichiers dans /public/badges/
 * puis mets USE_OFFICIAL_BADGES à true.
 */
const USE_OFFICIAL_BADGES = false;

export default function WalletButtons({
  token,
  showApple,
  showGoogle,
}: {
  token: string;
  showApple: boolean;
  showGoogle: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      {showApple && (
        <a href={`/api/wallet/apple/${token}`} className="block" aria-label="Ajouter à Apple Wallet">
          {USE_OFFICIAL_BADGES ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/badges/apple-wallet-fr.svg" alt="Ajouter à Apple Wallet" className="h-12" />
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl bg-black text-white px-5 py-3 font-semibold">
              Ajouter à Apple Wallet
            </span>
          )}
        </a>
      )}
      {showGoogle && (
        <a href={`/api/wallet/google/${token}`} className="block" aria-label="Ajouter à Google Wallet">
          {USE_OFFICIAL_BADGES ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/badges/google-wallet-fr.svg" alt="Ajouter à Google Wallet" className="h-12" />
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl bg-black text-white px-5 py-3 font-semibold">
              Ajouter à Google Wallet
            </span>
          )}
        </a>
      )}
    </div>
  );
}
