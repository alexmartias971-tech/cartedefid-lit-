import "server-only";
import jwt from "jsonwebtoken";
import { JWT } from "google-auth-library";
import { appUrl, publicUrl, requireBase64Env, requireEnv, signupUrl } from "@/lib/env";
import { computeCardState, describeProgram, designFromProgram, fieldLabels, googleFields, resolveSlots, streakSentence } from "@/lib/card-state";
import type { Business, Card, CardBundle, CatalogReward, Coupon, Customer, Program, Tier } from "@/lib/types";
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
    ...merchantLocations(business),
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
  const shareUrl = signupUrl(business.slug, card.referral_code);
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
    { uri: `${publicUrl()}/carte/${card.web_token}`, description: "Ma carte et mes cadeaux", id: "card" },
    { uri: `${publicUrl()}/confidentialite`, description: "Tes données et confidentialité", id: "privacy" },
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
    // Notification de proximité : « merchantLocations » (l'ancien « locations » ne déclenche plus rien chez Google). Le rayon est
    // fixé par Google, comme le texte de la notification.
    ...merchantLocations(business),
  };
}

/** Le commerce sur la carte Google (classe et carte de chaque client), s'il a sa position : Google prévient le client qui passe à côté. */
function merchantLocations(business: Business) {
  return business.latitude != null && business.longitude != null
    ? { merchantLocations: [{ latitude: Number(business.latitude), longitude: Number(business.longitude) }] }
    : {};
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
/**
 * Crée ou met à jour la carte Google. `notify` : Google prévient le téléphone si le compteur (loyaltyPoints) a changé,
 * comme l'iPhone après un passage (notifyPreference : pour cette requête seulement, 3 par 24 h au plus).
 * Si Google refuse la notification (quota), la carte est quand même mise à jour, sans notification.
 */
export async function upsertGoogleObject(bundle: CardBundle, opts: { notify?: boolean } = {}) {
  const body = objectBody(bundle);
  const existing = await call("GET", `/loyaltyObject/${body.id}`);
  if (existing.status === 404) {
    await call("POST", "/loyaltyObject", body);
    return;
  }
  if (opts.notify) {
    try {
      await call("PUT", `/loyaltyObject/${body.id}`, { ...body, notifyPreference: "NOTIFY_ON_UPDATE" });
      return;
    } catch (err) {
      console.error("[google notify]", (err as Error).message);
    }
  }
  await call("PUT", `/loyaltyObject/${body.id}`, body);
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

type GoogleObjectSeen = {
  state?: string;
  hasUsers?: boolean;
  loyaltyPoints?: { balance?: { string?: string } };
  merchantLocations?: unknown[];
  messages?: { header?: string; body?: string; messageType?: string }[];
};

/**
 * Ce que Google sait de la carte et de son modèle (contrôle Walty, sans téléphone Android) : la carte existe-t-elle,
 * est-elle dans un téléphone (hasUsers), son compteur, ses lieux, ses 5 derniers messages, et l'état du modèle
 * (reviewStatus : « approved » = ouvert à tous ; sinon le compte Google Wallet est peut-être encore en mode test).
 */
export async function googleObjectState(bundle: CardBundle) {
  const [o, c] = await Promise.all([
    call<GoogleObjectSeen>("GET", `/loyaltyObject/${googleObjectId(bundle.card.serial_number)}`),
    call<{ reviewStatus?: string }>("GET", `/loyaltyClass/${googleClassId(bundle.program)}`),
  ]);
  const obj = o.data;
  return {
    modele: c.data ? (c.data.reviewStatus ?? "inconnu") : "absent",
    carte: obj
      ? {
          etat: obj.state ?? null,
          dans_un_telephone: obj.hasUsers ?? null,
          compteur: obj.loyaltyPoints?.balance?.string ?? null,
          lieux: obj.merchantLocations?.length ?? 0,
          nb_messages: obj.messages?.length ?? 0,
          derniers_messages: (obj.messages ?? []).slice(-5).map((m) => ({ titre: m.header, texte: m.body, type: m.messageType })),
        }
      : "absente",
  };
}

/** Résultat d'un essai envoyé à Google : accepté ou refusé, et ce que Google a gardé. */
export type EssaiGoogle = { option: string; accepte: boolean; detail: string };

const court = (err: unknown) => ((err as Error)?.message ?? String(err)).replace(/^Google Wallet /, "").slice(0, 240);

type Variante = {
  option: string;
  program?: Partial<Program>;
  card?: Partial<Card>;
  business?: Partial<Business>;
  customer?: Partial<Customer>;
  tiers?: Tier[];
  catalog?: CatalogReward[];
  coupons?: Coupon[];
};

/**
 * Essai de toutes les options sur Google Wallet, pour de vrai (contrôle Walty, 29 oct. 2026 : vérifier Android sans
 * téléphone Android). Chaque option part chez Google sur un modèle et des cartes d'ESSAI à part (« essai_walty ») que
 * personne n'a dans son téléphone : aucune vraie carte n'est touchée, aucun client n'est prévenu. Google accepte ou
 * refuse chaque option, puis on relit ce qu'il a gardé. À la fin : un passage en caisse avec notification
 * (NOTIFY_ON_UPDATE), puis un message avec notification, envoyés tels quels pour voir la réponse de Google.
 * `logoBusinessId` : un commerce qui a un logo (pour l'essai « nom masqué + logo large »).
 */
export async function essaiGoogle(base: CardBundle, logoBusinessId: string | null): Promise<EssaiGoogle[]> {
  const T = new Date().toISOString();
  const pid = base.program.id;
  const classId = `${issuerId()}.programme_essai_walty`;
  const objectId = (n: number) => `${issuerId()}.carte_essai_walty_${n}`;
  const tiers: Tier[] = [
    { id: "essai-t0", program_id: pid, name: "Vacancier", min_value: 0, perk: null, color: null, image_url: null, sort: 0 },
    { id: "essai-t1", program_id: pid, name: "Habitué", min_value: 10, perk: "-5 % sur tout", color: "#0F4A5C", image_url: null, sort: 1 },
  ];
  const catalog: CatalogReward[] = [
    { id: "essai-r1", program_id: pid, name: "Un café", cost: 50, is_active: true, sort: 0 },
    { id: "essai-r2", program_id: pid, name: "Un brunch", cost: 200, is_active: true, sort: 1 },
  ];
  const offre: Coupon = {
    id: "essai-k1", card_id: base.card.id, program_id: pid, title: "-20 % ce week-end", kind: "manual",
    status: "active", expires_at: null, used_at: null, created_at: T,
  };
  // le lundi de la semaine en cours, heure de Guadeloupe (comme la série en vrai)
  const gp = new Date(Date.now() - 4 * 3600e3);
  const lundi = new Date(Date.UTC(gp.getUTCFullYear(), gp.getUTCMonth(), gp.getUTCDate() - ((gp.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
  const long = "Texte long avec accents, émojis 🎉☕🌴 et retours à la ligne.\n".repeat(30);
  const variantes: Variante[] = [
    { option: "La carte telle qu'elle est" },
    { option: "Cadeau prêt", card: { stamps_count: base.program.reward_threshold } },
    { option: "Mode points + catalogue", program: { mode: "points" }, card: { points_balance: 80, lifetime_points: 80 }, catalog },
    { option: "Mode cagnotte", program: { mode: "cashback", cashback_percent: 5 }, card: { cashback_balance: 4.5, lifetime_spent: 90 } },
    { option: "Niveaux", program: { tiers_enabled: true }, card: { lifetime_visits: 12, tier_id: "essai-t1" }, tiers },
    { option: "Heures boostées ×2", program: { bonus_multiplier: 2, bonus_start_hour: 14, bonus_end_hour: 16 } },
    {
      option: "Bienvenue + tampons offerts",
      program: { welcome_offer: "1 boule de glace offerte", signup_bonus: 2 },
      coupons: [{ ...offre, title: "1 boule de glace offerte", kind: "welcome" }],
    },
    { option: "Défi de la semaine", program: { streak_enabled: true }, card: { streak_count: 3, streak_best: 3, streak_week: lundi } },
    { option: "Offre ponctuelle", coupons: [offre] },
    { option: "Message du commerçant", card: { last_message: "Ce week-end : -20 % sur tout !" } },
    { option: "Notification à 100 m", business: { latitude: 16.221172, longitude: -61.395461 } },
    { option: "Avis Google + Instagram", business: { google_review_url: "https://g.page/r/essai/review", instagram_url: "https://instagram.com/walty" } },
    {
      option: "Textes longs et émojis",
      program: { back_text: long, reward_description: "Une boisson ou une glace au choix offerte 🍧" },
      customer: { first_name: "Marie-Héloïse 🌺" },
    },
    { option: "Nom de commerce très long", business: { name: "Le Snack Kréyol de la Plage de Sainte-Anne" } },
    ...(logoBusinessId
      ? [{ option: "Nom masqué + logo large", program: { show_logo_text: false }, business: { id: logoBusinessId, logo_url: "essai" } }]
      : []),
  ];

  const out: EssaiGoogle[] = [];
  let classeEnvoyee = "";
  for (const [i, v] of variantes.entries()) {
    const bundle: CardBundle = {
      program: { ...base.program, ...v.program },
      business: { ...base.business, ...v.business },
      card: { ...base.card, ...v.card },
      customer: { ...base.customer, ...v.customer },
      tiers: v.tiers ?? [],
      catalog: v.catalog ?? [],
      coupons: v.coupons ?? [],
    };
    const cBody = { ...classBody(bundle.program, bundle.business), id: classId };
    const oBody = { ...objectBody(bundle), id: objectId(i + 1), classId };
    try {
      // le modèle n'est renvoyé que s'il change d'une option à l'autre
      const cHash = hashOf(cBody);
      if (cHash !== classeEnvoyee) {
        const put = await call("PUT", `/loyaltyClass/${classId}`, cBody);
        if (put.status === 404) await call("POST", "/loyaltyClass", cBody);
        classeEnvoyee = cHash;
      }
      const put = await call("PUT", `/loyaltyObject/${oBody.id}`, oBody);
      if (put.status === 404) await call("POST", "/loyaltyObject", oBody);
      const lu = await call<
        GoogleObjectSeen & {
          secondaryLoyaltyPoints?: { balance?: { string?: string } };
          textModulesData?: unknown[];
          linksModuleData?: { uris?: unknown[] };
        }
      >("GET", `/loyaltyObject/${oBody.id}`);
      const o = lu.data;
      out.push({
        option: v.option,
        accepte: true,
        detail: o
          ? `compteur ${o.loyaltyPoints?.balance?.string ?? "?"}${o.secondaryLoyaltyPoints ? ` | ${o.secondaryLoyaltyPoints.balance?.string ?? "?"}` : ""}, ` +
            `${o.textModulesData?.length ?? 0} bloc(s) de texte, ${o.linksModuleData?.uris?.length ?? 0} lien(s), ${o.merchantLocations?.length ?? 0} lieu(x)`
          : "acceptée, mais introuvable à la relecture",
      });
    } catch (err) {
      out.push({ option: v.option, accepte: false, detail: court(err) });
    }
  }

  // Un passage en caisse sur une carte Android : le compteur change, Google prévient le téléphone
  const passage = { ...base, tiers: [], catalog: [], coupons: [], card: { ...base.card, stamps_count: base.card.stamps_count + 1 } };
  try {
    await call("PUT", `/loyaltyObject/${objectId(1)}`, { ...objectBody(passage), id: objectId(1), classId, notifyPreference: "NOTIFY_ON_UPDATE" });
    out.push({ option: "Passage en caisse avec notification", accepte: true, detail: "Google accepte la mise à jour avec notification (NOTIFY_ON_UPDATE)" });
  } catch (err) {
    out.push({ option: "Passage en caisse avec notification", accepte: false, detail: court(err) });
  }
  // Un message du commerçant (notifications, « Tu nous manques », avis, défi) : il s'affiche avec une notification
  try {
    await call("POST", `/loyaltyObject/${objectId(1)}/addMessage`, {
      message: { id: `msg_essai_${Date.now()}`, header: base.business.name.slice(0, 60), body: "Essai Walty : message avec notification", messageType: "TEXT_AND_NOTIFY" },
    });
    out.push({ option: "Message avec notification", accepte: true, detail: "Google accepte le message (TEXT_AND_NOTIFY)" });
  } catch (err) {
    out.push({ option: "Message avec notification", accepte: false, detail: court(err) });
  }
  // L'état du modèle d'essai, créé à l'instant : « approved » = Google valide tout seul les nouveaux modèles
  try {
    const c = await call<{ reviewStatus?: string }>("GET", `/loyaltyClass/${classId}`);
    out.push({ option: "Modèle d'essai chez Google", accepte: c.status < 400, detail: `état : ${c.data?.reviewStatus ?? "inconnu"}` });
  } catch (err) {
    out.push({ option: "Modèle d'essai chez Google", accepte: false, detail: court(err) });
  }
  return out;
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
      // les deux adresses d'où l'on peut ajouter la carte (technique et publique)
      origins: [...new Set([appUrl(), publicUrl()])],
      payload: { loyaltyObjects: [{ id: googleObjectId(serial) }] },
    },
    sa.private_key,
    { algorithm: "RS256" },
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}
