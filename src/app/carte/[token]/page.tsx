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
import { createAdminClient } from "@/lib/supabase/admin";
import { warmWallet } from "@/lib/wallet-warm";
import CardView from "./CardView";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ deja?: string }> };

/** La carte et son commerce : UNE lecture par affichage, partagée par le titre, la barre du téléphone et la page. */
const loadCard = cache((token: string) => loadCardBundle("web_token", token));

/** Titre de l'onglet (et du favori, que la page conseille d'ajouter) : « ADY COFFEE SHOP · Ma carte de fidélité ». */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { token } = await params;
  const bundle = await loadCard(token);
  if (!bundle) return { title: "Ma carte de fidélité" };
  // le manifeste de CETTE carte : mise sur l'écran d'accueil, elle rouvre la carte du client, au nom du commerce
  return {
    title: `${bundle.business.name} · Ma carte de fidélité`,
    manifest: `/carte/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: bundle.business.name.slice(0, 24), statusBarStyle: "default" },
  };
}

/** La barre du téléphone prend la couleur du commerce (comme la page d'inscription). */
export async function generateViewport({ params }: Pick<Props, "params">): Promise<Viewport> {
  const { token } = await params;
  const bundle = await loadCard(token);
  return { themeColor: shopTheme(bundle?.program).bg };
}

/**
 * Navigateur intégré d'une appli (Instagram, Facebook, Messenger, TikTok, Snapchat…, et « ; wv) » = vue web Android) :
 * Google y refuse la connexion (la carte Google ne s'ajouterait pas) et l'iPhone n'y ajoute pas toujours la carte.
 */
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger|Snapchat|TikTok|musical_ly|BytedanceWebview|Line\/|LinkedInApp|Pinterest|; wv\)/i;

/**
 * Relance sans Wallet (lib/email.ts) : la carte est-elle dans un téléphone (un iPhone inscrit, ou le bouton Google touché) ?
 * Sinon, le client reçoit-il déjà les bons plans par e-mail (adresse masquée : « al•••@gmail.com ») ?
 * En cas de panne : « dans un téléphone », rien ne s'affiche (la page ne casse jamais).
 */
async function relanceSansWallet(cardId: string, customerId: string, googleSaved: boolean) {
  if (googleSaved) return { sansWallet: false, email: null };
  try {
    const supabase = createAdminClient();
    const [regs, optin] = await Promise.all([
      supabase.from("apple_device_registrations").select("card_id", { count: "exact", head: true }).eq("card_id", cardId),
      supabase.from("email_optins").select("email").eq("customer_id", customerId).is("unsubscribed_at", null).maybeSingle(),
    ]);
    if (regs.error) return { sansWallet: false, email: null };
    const email = optin.error ? null : ((optin.data as { email: string } | null)?.email ?? null);
    const [nom, domaine] = (email ?? "").split("@");
    return { sansWallet: (regs.count ?? 0) === 0, email: email && domaine ? `${nom.slice(0, 2)}•••@${domaine}` : null };
  } catch {
    return { sansWallet: false, email: null };
  }
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
  const inApp = IN_APP.test(ua) ? (isAndroid ? "android" : isIOS ? "ios" : null) : null;
  // Pendant que le client lit sa page, on prépare sa carte Wallet : le bouton « Ajouter » répondra tout de suite
  if (bundle.business.status === "active" && (apple || google)) after(() => warmWallet(bundle, { apple, google }));
  const { card, program, tiers, catalog } = bundle;
  const [giftQr, logo, relance] = await Promise.all([
    // Cadeau prêt : QR code à montrer en caisse
    computeCardState(program, card, tiers, catalog).rewardReady
      ? QRCode.toDataURL(card.serial_number, { width: 360, margin: 1 })
      : null,
    // Le logo a-t-il son propre fond ? Se voit-il sur la couleur du commerce ? (pour le présenter sans cadre inutile)
    within(logoLook(bundle.business.logo_url), 2500),
    within(relanceSansWallet(card.id, bundle.customer.id, card.google_saved), 2500),
  ]);

  return (
    <CardView
      bundle={bundle}
      token={token}
      deja={!!deja}
      isAndroid={isAndroid}
      inApp={inApp}
      sansWallet={relance?.sansWallet ?? false}
      emailAbonne={relance?.email ?? null}
      apple={apple}
      google={google}
      giftQr={giftQr}
      logo={logo}
      shareBase={publicUrl()}
    />
  );
}
