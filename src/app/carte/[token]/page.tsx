import type { Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { computeCardState } from "@/lib/card-state";
import { loadCardBundle } from "@/lib/cards";
import { appUrl, isAppleConfigured, isGoogleConfigured } from "@/lib/env";
import CardView from "./CardView";

export const metadata = { title: "Ma carte de fidélité" };
// Barre du téléphone couleur « nuit Walty »
export const viewport: Viewport = { themeColor: "#110c18" };

/**
 * La page de la carte d'un client. Elle propose le bon bouton Wallet selon le téléphone,
 * et sert aussi de carte web de secours (à mettre en favori) pour les téléphones sans Wallet.
 * Ici : on charge les données et on détecte le téléphone. L'affichage est dans CardView.tsx.
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

  const ua = (await headers()).get("user-agent") ?? "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const apple = isAppleConfigured() && !isAndroid;
  const google = isGoogleConfigured() && !isIOS;
  // Cadeau prêt : QR code à montrer en caisse
  const { card, program, tiers, catalog } = bundle;
  const giftQr = computeCardState(program, card, tiers, catalog).rewardReady
    ? await QRCode.toDataURL(card.serial_number, { width: 360, margin: 1 })
    : null;

  return (
    <CardView
      bundle={bundle}
      token={token}
      deja={!!deja}
      isAndroid={isAndroid}
      apple={apple}
      google={google}
      giftQr={giftQr}
      shareBase={appUrl()}
    />
  );
}
