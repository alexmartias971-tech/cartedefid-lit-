import "server-only";
import jwt from "jsonwebtoken";
import { JWT } from "google-auth-library";
import { appUrl, requireBase64Env, requireEnv } from "@/lib/env";
import { computeCardState } from "@/lib/card-state";
import type { Business, CardBundle, Program } from "@/lib/types";

const API = "https://walletobjects.googleapis.com/walletobjects/v1";

type ServiceAccount = { client_email: string; private_key: string };

function serviceAccount(): ServiceAccount {
  const json = JSON.parse(requireBase64Env("GOOGLE_SERVICE_ACCOUNT_BASE64").toString("utf8"));
  if (!json.client_email || !json.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_BASE64 ne contient pas une clé de compte de service valide.");
  }
  return json;
}

let cachedClient: JWT | null = null;
function client(): JWT {
  if (!cachedClient) {
    const sa = serviceAccount();
    cachedClient = new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
    });
  }
  return cachedClient;
}

async function call<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null }> {
  const res = await client().request<T>({
    url: `${API}${path}`,
    method,
    data: body,
    validateStatus: () => true, // on gère nous-mêmes les erreurs
  });
  if (res.status >= 400 && res.status !== 404) {
    throw new Error(`Google Wallet ${method} ${path} → ${res.status} ${JSON.stringify(res.data)}`);
  }
  return { status: res.status, data: res.status === 404 ? null : res.data };
}

const issuerId = () => requireEnv("GOOGLE_WALLET_ISSUER_ID");

/** Identifiants Google : lettres, chiffres, "." "_" "-" uniquement. */
export const googleClassId = (program: Program) => `${issuerId()}.programme_${program.id.replace(/-/g, "_")}`;
export const googleObjectId = (serial: string) => `${issuerId()}.carte_${serial.replace(/-/g, "_")}`;

function logoUri(business: Business) {
  return `${appUrl()}/api/logo/${business.id}`;
}

function classBody(program: Program, business: Business) {
  return {
    id: googleClassId(program),
    issuerName: business.name.slice(0, 20),
    programName: program.name,
    programLogo: {
      sourceUri: { uri: logoUri(business) },
      contentDescription: { defaultValue: { language: "fr-FR", value: business.name } },
    },
    hexBackgroundColor: program.background_color,
    reviewStatus: "UNDER_REVIEW",
    countryCode: "FR",
    localizedIssuerName: { defaultValue: { language: "fr-FR", value: business.name } },
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
  };
}

/** Crée ou met à jour la "classe" Google (le modèle de carte d'une entreprise). */
export async function upsertGoogleClass(program: Program, business: Business) {
  const id = googleClassId(program);
  const body = classBody(program, business);
  const existing = await call("GET", `/loyaltyClass/${id}`);
  if (existing.status === 404) await call("POST", "/loyaltyClass", body);
  else await call("PUT", `/loyaltyClass/${id}`, body);
}

function objectBody({ card, customer, program, business, tiers, catalog, coupons }: CardBundle) {
  const state = computeCardState(program, card, tiers, catalog);
  const textModulesData = [{ id: "status", header: "Ta carte", body: state.sentence }];
  if (coupons.length > 0) {
    textModulesData.push({ id: "coupons", header: "Tes offres", body: coupons.map((c) => `• ${c.title}`).join("\n") });
  }
  if (state.tier) {
    const next = state.nextTier ? ` Prochain niveau (${state.nextTier.tier.name}) dans ${state.nextTier.remaining}.` : "";
    textModulesData.push({
      id: "tier",
      header: `Niveau ${state.tier.name}`,
      body: `${state.tier.perk ?? ""}${next}`.trim() || state.tier.name,
    });
  }
  if (program.mode === "points" && catalog.length > 0) {
    textModulesData.push({
      id: "catalog",
      header: "Cadeaux",
      body: catalog.filter((r) => r.is_active).map((r) => `${r.cost} pts : ${r.name}`).join("\n"),
    });
  }
  textModulesData.push({ id: "rule", header: "Règle", body: state.rule });
  if (card.last_message) textModulesData.push({ id: "message", header: `Message de ${business.name}`, body: card.last_message });
  if (program.back_text) textModulesData.push({ id: "info", header: "Informations", body: program.back_text });

  // L'image est versionnée : Google ne la recharge que si l'adresse change
  const version = new Date(card.updated_at).getTime();
  return {
    id: googleObjectId(card.serial_number),
    classId: googleClassId(program),
    state: "ACTIVE",
    accountId: card.serial_number,
    accountName: customer.first_name,
    loyaltyPoints: { label: state.balanceLabel.toLowerCase(), balance: { string: state.balanceValue } },
    ...(state.tier ? { secondaryLoyaltyPoints: { label: "niveau", balance: { string: state.tier.name } } } : {}),
    barcode: { type: "QR_CODE", value: card.serial_number, alternateText: customer.first_name },
    hexBackgroundColor: state.tier?.color || program.background_color,
    heroImage: {
      sourceUri: { uri: `${appUrl()}/api/strip/${card.serial_number}?v=${version}` },
      contentDescription: { defaultValue: { language: "fr-FR", value: program.name } },
    },
    textModulesData,
    linksModuleData: {
      uris: [{ uri: `${appUrl()}/confidentialite`, description: "Tes données et confidentialité", id: "privacy" }],
    },
  };
}

/** Crée ou met à jour la carte Google d'un client. */
export async function upsertGoogleObject(bundle: CardBundle) {
  const body = objectBody(bundle);
  const existing = await call("GET", `/loyaltyObject/${body.id}`);
  if (existing.status === 404) await call("POST", "/loyaltyObject", body);
  else await call("PUT", `/loyaltyObject/${body.id}`, body);
}

/** Ajoute un message avec notification sur la carte Google (limite Google : ~3 par jour). */
export async function addGoogleMessage(serial: string, header: string, body: string) {
  const id = googleObjectId(serial);
  await call("POST", `/loyaltyObject/${id}/addMessage`, {
    message: {
      id: `msg_${Date.now()}`,
      header: header.slice(0, 60),
      body,
      messageType: "TEXT_AND_NOTIFY",
    },
  });
}

/** Lien "Ajouter à Google Wallet" (un jeton signé avec la clé du compte de service). */
export function googleSaveUrl(serial: string): string {
  const sa = serviceAccount();
  const token = jwt.sign(
    {
      iss: sa.client_email,
      aud: "google",
      typ: "savetowallet",
      origins: [appUrl()],
      payload: { loyaltyObjects: [{ id: googleObjectId(serial) }] },
    },
    sa.private_key,
    { algorithm: "RS256" },
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}
