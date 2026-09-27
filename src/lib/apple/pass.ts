import "server-only";
import { PKPass, PassType } from "passkit-generator";
import { appUrl, requireBase64Env, requireEnv } from "@/lib/env";
import { computeCardState } from "@/lib/card-state";
import { hexToRgb } from "@/lib/format";
import { squareLogoPng, wideLogoPng } from "@/lib/logo";
import { renderStrip } from "@/lib/strip";
import type { CardBundle } from "@/lib/types";

/**
 * Fabrique le fichier .pkpass (la carte Apple Wallet) d'un client.
 * Chaque fois qu'une carte change (tampon, notification), Apple rappelle
 * notre serveur et on refabrique ce fichier avec les nouvelles valeurs.
 */
export async function buildApplePass({
  card,
  customer,
  program,
  business,
  tiers,
  catalog,
  coupons,
}: CardBundle): Promise<Buffer> {
  const state = computeCardState(program, card, tiers, catalog);
  const filled = state.stamps?.filled ?? 0;
  const [strip1, strip2, strip3, icon1, icon2, icon3, logo1, logo2, logo3] = await Promise.all([
    renderStrip(program, filled, 1),
    renderStrip(program, filled, 2),
    renderStrip(program, filled, 3),
    squareLogoPng(business, program, 29),
    squareLogoPng(business, program, 58),
    squareLogoPng(business, program, 87),
    wideLogoPng(business, program, 1),
    wideLogoPng(business, program, 2),
    wideLogoPng(business, program, 3),
  ]);

  const url = appUrl();
  // Apple exige une adresse https pour les mises à jour automatiques.
  const webService = url.startsWith("https://")
    ? { webServiceURL: `${url}/api/passkit`, authenticationToken: card.auth_token }
    : {};

  const pass = new PKPass(
    {
      "icon.png": icon1,
      "icon@2x.png": icon2,
      "icon@3x.png": icon3,
      "logo.png": logo1,
      "logo@2x.png": logo2,
      "logo@3x.png": logo3,
      "strip.png": strip1,
      "strip@2x.png": strip2,
      "strip@3x.png": strip3,
    },
    {
      wwdr: requireBase64Env("APPLE_WWDR_BASE64"),
      signerCert: requireBase64Env("APPLE_PASS_CERT_BASE64"),
      signerKey: requireBase64Env("APPLE_PASS_KEY_BASE64"),
      signerKeyPassphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || undefined,
    },
    {
      formatVersion: 1,
      passTypeIdentifier: requireEnv("APPLE_PASS_TYPE_ID"),
      teamIdentifier: requireEnv("APPLE_TEAM_ID"),
      serialNumber: card.serial_number,
      organizationName: business.name,
      description: `Carte de fidélité ${business.name}`,
      logoText: business.name,
      backgroundColor: hexToRgb(state.tier?.color || program.background_color),
      foregroundColor: hexToRgb(program.foreground_color),
      labelColor: hexToRgb(program.label_color),
      sharingProhibited: true,
      ...webService,
    },
  );

  const store = new PassType("storeCard");

  // Recto de la carte (la disposition est imposée par Apple : en-tête, bannière, 2 lignes de champs)
  store.headerFields.push({
    key: "balance",
    label: state.balanceLabel,
    value: state.balanceValue,
    textAlignment: "PKTextAlignmentRight",
  });
  if (program.mode !== "stamps") {
    // Le solde s'affiche en grand sur la bannière
    store.primaryFields.push({ key: "big", label: state.balanceLabel, value: state.balanceValue });
  }
  store.secondaryFields.push({ key: "customer", label: "CLIENT", value: customer.first_name });
  if (program.mode === "stamps") {
    store.secondaryFields.push({ key: "reward", label: "CADEAU", value: program.reward_description });
  } else if (program.mode === "points") {
    const next = catalog.find((r) => r.is_active && r.cost > card.points_balance);
    if (next) store.secondaryFields.push({ key: "next", label: `À ${next.cost} PTS`, value: next.name });
  } else {
    store.secondaryFields.push({ key: "rate", label: "CASHBACK", value: `${Number(program.cashback_percent)} %` });
  }
  if (state.tier) store.auxiliaryFields.push({ key: "tier", label: "NIVEAU", value: state.tier.name, changeMessage: "Nouveau niveau : %@ !" });
  if (coupons.length > 0) {
    store.auxiliaryFields.push({
      key: "offers",
      label: "OFFRES",
      value: `${coupons.length} disponible${coupons.length > 1 ? "s" : ""}`,
    });
  }

  // Dos de la carte. "changeMessage" = le texte qui s'affiche en notification quand la valeur change.
  store.backFields.push(
    { key: "status", label: "Ta carte", value: state.sentence, changeMessage: "%@" },
    {
      key: "message",
      label: `Message de ${business.name}`,
      value: card.last_message ?? "Aucun message pour le moment.",
      changeMessage: "%@",
    },
  );
  if (coupons.length > 0) {
    store.backFields.push({
      key: "coupons",
      label: "Tes offres (à montrer en caisse)",
      value: coupons.map((c) => `• ${c.title}`).join("\n"),
      changeMessage: "Nouvelle offre disponible !",
    });
  }
  if (state.tier) {
    const perk = state.tier.perk ? ` : ${state.tier.perk}` : "";
    const next = state.nextTier ? `\nProchain niveau (${state.nextTier.tier.name}) dans ${state.nextTier.remaining}.` : "";
    store.backFields.push({ key: "tierinfo", label: "Ton niveau", value: `${state.tier.name}${perk}${next}` });
  }
  if (program.mode === "points" && catalog.length > 0) {
    store.backFields.push({
      key: "catalog",
      label: "Cadeaux",
      value: catalog.filter((r) => r.is_active).map((r) => `${r.cost} pts : ${r.name}`).join("\n"),
    });
  }
  store.backFields.push({
    key: "rules",
    label: "Règles du programme",
    value: `${state.rule} ${program.max_stamps_per_day} passage(s) maximum par jour. Enregistré par le commerçant en scannant ta carte.`,
  });
  if (program.back_text) store.backFields.push({ key: "info", label: "Informations", value: program.back_text });
  if (business.address) store.backFields.push({ key: "address", label: "Adresse", value: business.address });
  if (business.phone) {
    store.backFields.push({
      key: "phone",
      label: "Téléphone",
      value: business.phone,
      dataDetectorTypes: ["PKDataDetectorTypePhoneNumber"],
    });
  }
  store.backFields.push({
    key: "privacy",
    label: "Tes données",
    value: `Politique de confidentialité et suppression de tes données : ${url}/confidentialite`,
    dataDetectorTypes: ["PKDataDetectorTypeLink"],
  });

  pass.types.push(store);
  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: card.serial_number,
    messageEncoding: "iso-8859-1",
    altText: customer.first_name,
  });

  return pass.getAsBuffer();
}
