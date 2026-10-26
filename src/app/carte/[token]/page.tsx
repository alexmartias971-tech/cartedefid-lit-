import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import QRCode from "qrcode";
import { cache } from "react";
import { computeCardState } from "@/lib/card-state";
import { loadCardBundle } from "@/lib/cards";
import { isAppleConfigured, isGoogleConfigured, publicUrl } from "@/lib/env";
import { logoLook } from "@/lib/logo";
import { shopTheme } from "@/lib/shop-theme";
import { warmWallet } from "@/lib/wallet-warm";
import CardView from "./CardView";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ deja?: string }> };

/** La carte et son commerce : UNE lecture par affichage, partagée par le titre, la barre du téléphone et la page. */
const loadCard = cache((token: string) => loadCardBundle("web_token", token));

/** Titre de l'onglet (et du favori, que la page conseille d'ajouter) : « ADY COFFEE SHOP · Ma carte de fidélité ». */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { token } = await params;
  const bundle = await loadCard(token);
  return { title: bundle ? `${bundle.business.name} · Ma carte de fidélité` : "Ma carte de fidélité" };
}

/** La barre du téléphone prend la couleur du commerce (comme la page d'inscription). */
export async function generateViewport({ params }: Pick<Props, "params">): Promise<Viewport> {
  const { token } = await params;
  const bundle = await loadCard(token);
  return { themeColor: shopTheme(bundle?.program).bg };
}

/** Attend au plus `ms` : la page ne reste jamais bloquée par une image lente (on fait sans). */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * La page de la carte d'un client. Elle propose le bon bouton Wallet selon le téléphone,
 * et sert aussi de carte web de secours (à mettre en favori) pour les téléphones sans Wallet.
 * Ici : on charge les données et on détecte le téléphone. L'affichage est dans CardView.tsx.
 */
export default async function CardPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { deja } = await searchParams;
  const bundle = await loadCard(token);
  if (!bundle) notFound();

  const ua = (await headers()).get("user-agent") ?? "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const apple = isAppleConfigured() && !isAndroid;
  const google = isGoogleConfigured() && !isIOS;
  // Pendant que le client lit sa page, on prépare sa carte Wallet : le bouton « Ajouter » répondra tout de suite
  if (bundle.business.status === "active" && (apple || google)) after(() => warmWallet(bundle, { apple, google }));
  const { card, program, tiers, catalog } = bundle;
  const [giftQr, logo] = await Promise.all([
    // Cadeau prêt : QR code à montrer en caisse
    computeCardState(program, card, tiers, catalog).rewardReady
      ? QRCode.toDataURL(card.serial_number, { width: 360, margin: 1 })
      : null,
    // Le logo a-t-il son propre fond ? Se voit-il sur la couleur du commerce ? (pour le présenter sans cadre inutile)
    within(logoLook(bundle.business.logo_url), 2500),
  ]);

  return (
    <CardView
      bundle={bundle}
      token={token}
      deja={!!deja}
      isAndroid={isAndroid}
      apple={apple}
      google={google}
      giftQr={giftQr}
      logo={logo}
      shareBase={publicUrl()}
    />
  );
}
