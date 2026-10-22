import "server-only";
import jwt from "jsonwebtoken";
import { JWT } from "google-auth-library";
import { appUrl, requireBase64Env, requireEnv } from "@/lib/env";
import { computeCardState, describeProgram, designFromProgram, fieldLabels, googleFields, resolveSlots, streakSentence } from "@/lib/card-state";
import type { Business, CardBundle, Program } from "@/lib/types";
import { hashOf, inBackground, storageGet, storagePut } from "@/lib/wallet-cache";

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
  allowed: number[] = [404],
): Promise<{ status: number; data: T | null }> {
  const res = await client().request<T>({
    url: `${API}${path}`,
    method,
    data: body,
    validateStatus: () => true, // on gère nous-mêmes les erreurs
  });
  if (res.status >= 400 && !allowed.includes(res.status)) {
    throw new Error(`Google Wallet ${method} ${path} → ${res.status} ${JSON.stringify(res.data)}`);
  }
  return { status: res.status, data: res.status >= 400 ? null : res.data };
}

const issuerId = () => requireEnv("GOOGLE_WALLET_ISSUER_ID");

/** Identifiants Google : lettres, chiffres, "." "_" "-" uniquement. */
export const googleClassId = (program: Program) => `${issuerId()}.programme_${program.id.replace(/-/g, "_")}`;
export const googleObjectId = (serial: string) => `${issuerId()}.carte_${serial.replace(/-/g, "_")}`;

/** Adresse du logo (versionnée : Google ne recharge une image que si son adresse change). */
function logoUri(business: Business, wide = false) {
  const v = new Date(business.updated_at).getTime() || 0;
  return `${appUrl()}/api/logo/${business.id}?v=${v}${wide ? "&wide=1" : ""}`;
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
    // Nom masqué + logo : le logo large remplace le logo rond ET le nom en haut de la carte Android
    ...(!program.show_logo_text && business.logo_url
      ? {
          wideProgramLogo: {
            sourceUri: { uri: logoUri(business, true) },
            contentDescription: { defaultValue: { language: "fr-FR", value: business.name } },
          },
        }
      : {}),
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
  const design = designFromProgram(program);
  const labels = fieldLabels(design, state);
  // Zones choisies dans l'éditeur visuel : à gauche la zone « en haut », à droite le 1er champ du bas
  const nextReward =
    program.mode === "points"
      ? ([...catalog].filter((r) => r.is_active).sort((a, b) => a.cost - b.cost).find((r) => r.cost > card.points_balance) ?? null)
      : null;
  const slots = resolveSlots(design, state, {
    customerName: customer.first_name,
    mode: program.mode,
    rewardDescription: program.reward_description,
    cashbackPercent: Number(program.cashback_percent),
    nextReward: nextReward ? { cost: nextReward.cost, name: nextReward.name } : null,
    coupons: coupons.length,
  });
  void slots;
  const gf = googleFields(state, program.mode, labels.balance, coupons.length);
  const unit = program.mode === "stamps" ? (program.progress_style === "track" ? "secteurs" : "tampons") : program.mode === "points" ? "points" : "€";
  const shareUrl = `${appUrl()}/c/${business.slug}?p=${card.referral_code}`;
  const streakText = streakSentence(state, program.streak_bonus, unit);
  const now: string[] = [state.sentence];
  if (state.lap) now.push(`⏱️ Ton record : ${state.lap}. Bats-le au prochain passage !`);
  if (streakText) now.push(streakText);
  if (state.tier) {
    const next = state.nextTier ? ` Prochain niveau (${state.nextTier.tier.name}) dans ${state.nextTier.remaining}.` : "";
    now.push(`Niveau ${state.tier.name}${state.tier.perk ? ` : ${state.tier.perk}` : ""}.${next}`);
  }
  if (coupons.length > 0) now.push(`🎁 Tes offres (à montrer en caisse) :\n${coupons.map((c) => `• ${c.title}`).join("\n")}`);
  if (card.last_message) now.push(`📣 ${business.name} : ${card.last_message}`);
  const rules: string[] = describeProgram(program, tiers)
    .filter((r) => r.title !== "Parrainage") // repris plus bas, avec le lien
    .map((r) => `${r.icon} ${r.title} : ${r.text}`);
  if (program.referral_bonus > 0) {
    const n = program.referral_bonus;
    rules.push(`🤝 Parraine un ami avec le lien « Parrainer un ami » plus bas : à sa première visite, tu gagnes ${n} ${program.mode === "points" ? "point" : "tampon"}${n > 1 ? "s" : ""} en plus.`);
  }
  if (program.back_text) rules.push(program.back_text);
  const gifts =
    program.mode === "points" && catalog.length > 0
      ? [catalog.filter((r) => r.is_active).map((r) => `${r.cost} pts : ${r.name}`).join("\n")]
      : [];
  // Google conseille 500 caractères au plus par bloc (au-delà, la fin est coupée sur les petits écrans) : on découpe
  const textModulesData = [
    ...textBlocks("status", "Ta carte", now),
    ...textBlocks("howto", "Comment ça marche", rules),
    ...textBlocks("gifts", "Les cadeaux", gifts),
  ];
  const uris = [
    { uri: `${appUrl()}/carte/${card.web_token}`, description: "Ma carte et mes cadeaux", id: "card" },
    { uri: `${appUrl()}/confidentialite`, description: "Tes données et confidentialité", id: "privacy" },
  ];
  // Ordre affiché : la page de la carte, puis avis, Instagram, parrainage, confidentialité
  if (program.referral_bonus > 0) uris.splice(1, 0, { uri: shareUrl, description: "Parrainer un ami", id: "referral" });
  if (business.instagram_url) uris.splice(1, 0, { uri: business.instagram_url, description: "Instagram", id: "instagram" });
  if (business.google_review_url) uris.splice(1, 0, { uri: business.google_review_url, description: "Laisser un avis Google", id: "review" });

  // L'image est versionnée : Google ne la recharge que si l'adresse change
  const version = new Date(card.updated_at).getTime();
  return {
    id: googleObjectId(card.serial_number),
    classId: googleClassId(program),
    state: "ACTIVE",
    accountId: card.serial_number,
    accountName: customer.first_name,
    // Recto Android : 2 compteurs courts (le cadeau est dans le titre de la carte)
    loyaltyPoints: { label: gf.left.label, balance: { string: gf.left.value } },
    ...(gf.right ? { secondaryLoyaltyPoints: { label: gf.right.label, balance: { string: gf.right.value } } } : {}),
    barcode: { type: "QR_CODE", value: card.serial_number },
    heroImage: {
      sourceUri: { uri: `${appUrl()}/api/strip/${card.serial_number}?v=${version}` },
      contentDescription: { defaultValue: { language: "fr-FR", value: program.name } },
    },
    textModulesData,
    linksModuleData: { uris },
    ...(business.latitude != null && business.longitude != null
      ? { locations: [{ latitude: Number(business.latitude), longitude: Number(business.longitude) }] }
      : {}),
  };
}

/** Découpe des paragraphes en blocs de texte Google de 500 caractères au plus (« (suite) » pour les blocs suivants). */
function textBlocks(id: string, header: string, parts: string[]): { id: string; header: string; body: string }[] {
  const out: { id: string; header: string; body: string }[] = [];
  let cur = "";
  const flush = () => {
    if (!cur) return;
    out.push({ id: out.length ? `${id}${out.length + 1}` : id, header: out.length ? `${header} (suite)` : header, body: cur });
    cur = "";
  };
  for (const p of parts) {
    const piece = p.length > 500 ? `${p.slice(0, 499)}…` : p;
    if (cur && cur.length + 2 + piece.length > 500) flush();
    cur = cur ? `${cur}\n\n${piece}` : piece;
  }
  flush();
  return out;
}

/** Crée ou met à jour la carte Google d'un client. */
export async function upsertGoogleObject(bundle: CardBundle) {
  const body = objectBody(bundle);
  const existing = await call("GET", `/loyaltyObject/${body.id}`);
  if (existing.status === 404) await call("POST", "/loyaltyObject", body);
  else await call("PUT", `/loyaltyObject/${body.id}`, body);
}

/**
 * Bouton « Ajouter à Google Wallet », en version rapide :
 *  - on ne renvoie le modèle (classe) et la carte (objet) à Google que s'ils ont changé depuis le dernier clic
 *    (un repère, l'empreinte de ce qu'on a envoyé, est gardé dans le cache « pass-cache ») ;
 *  - carte nouvelle : on la crée directement (1 appel au lieu de 2), « existe déjà » → mise à jour.
 * Avant : 4 appels à Google à chaque clic (lire + écrire, deux fois). Après : 1 appel (nouvelle carte), 0 si rien n'a changé.
 */
export async function prepareGoogleSave(bundle: CardBundle): Promise<{ classSent: boolean; objectSent: boolean }> {
  const { program, business, card } = bundle;
  const cBody = classBody(program, business);
  const oBody = objectBody(bundle);
  const cHash = hashOf(cBody);
  const oHash = hashOf(oBody);
  const cMark = `google/class/${program.id}.txt`;
  const oMark = `google/object/${card.serial_number}.txt`;
  const [cSeen, oSeen] = await Promise.all([storageGet(cMark), storageGet(oMark)]);
  const classSent = cSeen?.toString() !== cHash;
  const objectSent = oSeen?.toString() !== oHash;

  // Le modèle doit exister avant la carte : d'abord le modèle (en général déjà là : 0 appel)
  if (classSent) {
    const put = await call("PUT", `/loyaltyClass/${cBody.id}`, cBody);
    if (put.status === 404) await call("POST", "/loyaltyClass", cBody);
  }
  if (objectSent) {
    if (card.google_saved) {
      // Carte déjà chez Google : mise à jour directe (création si elle a disparu)
      const put = await call("PUT", `/loyaltyObject/${oBody.id}`, oBody);
      if (put.status === 404) await call("POST", "/loyaltyObject", oBody);
    } else {
      const created = await call("POST", "/loyaltyObject", oBody, [409]);
      if (created.status === 409) await call("PUT", `/loyaltyObject/${oBody.id}`, oBody);
    }
  }
  // Les repères sont notés après la réponse (le client n'attend pas)
  if (classSent || objectSent) {
    await inBackground(async () => {
      await Promise.all([
        classSent ? storagePut(cMark, Buffer.from(cHash), "text/plain") : null,
        objectSent ? storagePut(oMark, Buffer.from(oHash), "text/plain") : null,
      ]);
    });
  }
  return { classSent, objectSent };
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
