import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import CardPreview from "@/components/CardPreview";
import WalletButtons from "@/components/WalletButtons";
import { loadCardBundle } from "@/lib/cards";
import { isAppleConfigured, isGoogleConfigured } from "@/lib/env";
import { statusSentence } from "@/lib/format";

export const metadata = { title: "Ma carte de fidélité" };

/**
 * La page de la carte d'un client. Elle propose le bon bouton Wallet selon le téléphone,
 * et sert aussi de carte web de secours (à mettre en favori) pour les téléphones sans Wallet.
 */
export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ deja?: string }>;
}) {
  const { token } = await params;
  const { deja } = await searchParams;
  const bundle = await loadCardBundle("web_token", token);
  if (!bundle) notFound();
  const { card, customer, program, business } = bundle;

  const ua = (await headers()).get("user-agent") ?? "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const apple = isAppleConfigured() && !isAndroid;
  const google = isGoogleConfigured() && !isIOS;
  const qr = await QRCode.toDataURL(card.serial_number, { width: 360, margin: 1 });

  return (
    <main className="flex-1 w-full max-w-md mx-auto p-4 space-y-5">
      <h1 className="text-2xl font-bold text-center">
        Ta carte {business.name} est prête, {customer.first_name} !
      </h1>
      {deja && <p className="alert-ok text-center">Tu avais déjà une carte : la voici.</p>}

      <div className="panel space-y-3 text-center">
        <p className="font-semibold">Ajoute-la à ton téléphone :</p>
        <WalletButtons token={token} showApple={apple} showGoogle={google} />
        {!apple && !google && (
          <p className="text-sm text-gray-600">Garde simplement cette page en favori : c&apos;est ta carte.</p>
        )}
      </div>

      <div className="flex justify-center">
        <CardPreview
          platform={isAndroid ? "google" : "apple"}
          businessName={business.name}
          programName={program.name}
          reward={program.reward_description}
          threshold={program.reward_threshold}
          stamps={card.stamps_count}
          customerName={customer.first_name}
          backgroundColor={program.background_color}
          foregroundColor={program.foreground_color}
          labelColor={program.label_color}
          logoUrl={business.logo_url}
        />
      </div>

      <div className="panel text-center space-y-2">
        <p className="font-semibold">Ma carte web (si tu n&apos;utilises pas de Wallet)</p>
        <p className="text-sm">
          {statusSentence(card.stamps_count, program.reward_threshold, program.reward_description)}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Ton QR code à présenter en caisse" className="mx-auto w-56 h-56" />
        <p className="text-sm text-gray-600">
          Montre ce QR code en caisse. Ajoute cette page à tes favoris pour la retrouver.
        </p>
        {card.last_message && <p className="text-sm bg-gray-50 rounded-lg p-2">📣 {card.last_message}</p>}
      </div>

      <p className="text-center text-xs text-gray-500">
        <a href="/confidentialite" className="underline">
          Confidentialité et suppression de tes données
        </a>
      </p>
    </main>
  );
}
