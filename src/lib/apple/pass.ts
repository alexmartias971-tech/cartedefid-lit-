import "server-only";
import { PKPass, PassType } from "passkit-generator";
import { appUrl, requireBase64Env, requireEnv } from "@/lib/env";
import { hexToRgb, statusSentence } from "@/lib/format";
import { squareLogoPng, wideLogoPng } from "@/lib/logo";
import type { CardBundle } from "@/lib/types";

/**
 * Fabrique le fichier .pkpass (la carte Apple Wallet) d'un client.
 * Chaque fois qu'une carte change (tampon, notification), Apple rappelle
 * notre serveur et on refabrique ce fichier avec les nouvelles valeurs.
 */
export async function buildApplePass({ card, customer, program, business }: CardBundle): Promise<Buffer> {
  const [icon1, icon2, icon3, logo1, logo2, logo3] = await Promise.all([
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
      backgroundColor: hexToRgb(program.background_color),
      foregroundColor: hexToRgb(program.foreground_color),
      labelColor: hexToRgb(program.label_color),
      sharingProhibited: true,
      ...webService,
    },
  );

  const store = new PassType("storeCard");
  const threshold = program.reward_threshold;
  const stamps = Math.min(card.stamps_count, threshold);

  store.headerFields.push({ key: "stamps", label: "TAMPONS", value: `${stamps}/${threshold}` });
  store.primaryFields.push({ key: "program", label: business.name.toUpperCase(), value: program.name });
  store.secondaryFields.push(
    { key: "customer", label: "CLIENT", value: customer.first_name },
    { key: "reward", label: "CADEAU", value: program.reward_description },
  );
  store.auxiliaryFields.push({
    key: "progress",
    label: "PROGRESSION",
    value: "●".repeat(stamps) + "○".repeat(Math.max(0, threshold - stamps)),
  });

  // Champs au dos de la carte. "changeMessage" = le texte qui s'affiche en notification
  // quand la valeur change.
  store.backFields.push(
    {
      key: "status",
      label: "Ta carte",
      value: statusSentence(card.stamps_count, threshold, program.reward_description),
      changeMessage: "%@",
    },
    {
      key: "message",
      label: `Message de ${business.name}`,
      value: card.last_message ?? "Aucun message pour le moment.",
      changeMessage: "%@",
    },
    {
      key: "rules",
      label: "Règles du programme",
      value: `${threshold} tampons = ${program.reward_description}. ${program.max_stamps_per_day} tampon(s) maximum par jour. Tampon ajouté par le commerçant en scannant ta carte.`,
    },
  );
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
