import "server-only";
import { appUrl, publicUrl, requireBase64Env, requireEnv, signupUrl } from "@/lib/env";
import { computeCardState, describeProgram, designFromProgram, fieldLabels, posterFields, resolveSlots, streakSentence } from "@/lib/card-state";
import { hexToRgb } from "@/lib/format";
import type { CardBundle } from "@/lib/types";
import { ByteCache, hashOf, once } from "@/lib/wallet-cache";
import { ensurePassImages, getPassImages, imageKeys, type ImageSource } from "@/lib/wallet-images";
import type { PassImageFlags } from "@/lib/apple/pass-images";

/**
 * Fabrique le fichier .pkpass (la carte Apple Wallet) d'un client.
 * Chaque fois qu'une carte change (tampon, notification), Apple rappelle
 * notre serveur et on refabrique ce fichier avec les nouvelles valeurs.
 *
 * Rapidité (oct. 2026) : le contenu de la carte (textes, champs) est calculé en premier, sans aucune image.
 * Les images viennent du cache (wallet-images.ts) : elles ne sont dessinées qu'une fois par état de carte.
 * Le fichier signé est gardé en mémoire : si rien n'a changé, il est renvoyé tel quel.
 */

// Champs d'une carte (même forme que pour passkit-generator)
type PassField = { key: string; value: string; [k: string]: unknown };
type StoreFields = Record<"headerFields" | "primaryFields" | "secondaryFields" | "auxiliaryFields" | "backFields", PassField[]>;
type PosterFields = Record<"headerFields" | "primaryFields" | "footerFields" | "backFields", PassField[]>;

/** Tout le contenu d'une carte, sauf les images (calcul instantané, sert aussi d'empreinte pour le cache). */
export type ApplePassDescription = {
  props: Record<string, unknown>;
  store: StoreFields;
  poster: PosterFields;
  featuredActions: { identifier: string; type: string; url: string }[];
  barcode: { format: "PKBarcodeFormatQR"; message: string; messageEncoding: string };
  images: PassImageFlags;
};

export function describeApplePass(bundle: CardBundle): ApplePassDescription {
  const { card, customer, program, business, tiers, catalog, coupons } = bundle;
  const state = computeCardState(program, card, tiers, catalog);
  const design = designFromProgram(program);
  const labels = fieldLabels(design, state);
  // En haut de la carte : le petit logo (si le commerçant en a un et le garde), et/ou le nom.
  // Sans logo, le nom est toujours affiché (sinon on ne reconnaîtrait pas la carte dans le Wallet).
  const hasLogo = !!business.logo_url;
  const showTopLogo = hasLogo && design.layout.topLogo !== false;
  const showName = design.showLogoText || !showTopLogo;

  const url = appUrl();
  // les liens que le client voit (parrainage, classement, sa carte, confidentialité) : l'adresse publique (carte.walty.fr)
  const pub = publicUrl();
  // Apple exige une adresse https pour les mises à jour automatiques (adresse technique, inchangée).
  const webService = url.startsWith("https://")
    ? { webServiceURL: `${url}/api/passkit`, authenticationToken: card.auth_token }
    : {};

  // La carte apparaît sur l'écran verrouillé quand le client passe près du commerce
  const locations =
    business.latitude != null && business.longitude != null
      ? {
          locations: [
            {
              latitude: Number(business.latitude),
              longitude: Number(business.longitude),
              relevantText: business.relevant_text || `Tu es près de ${business.name} ! Montre ta carte.`,
            },
          ],
          maxDistance: 150,
        }
      : {};

  const props = {
    formatVersion: 1,
    passTypeIdentifier: requireEnv("APPLE_PASS_TYPE_ID"),
    teamIdentifier: requireEnv("APPLE_TEAM_ID"),
    serialNumber: card.serial_number,
    organizationName: business.name,
    description: `Carte de fidélité ${business.name}`,
    ...(showName ? { logoText: business.name } : {}),
    backgroundColor: hexToRgb(state.tier?.color || program.background_color),
    foregroundColor: hexToRgb(program.foreground_color),
    labelColor: hexToRgb(program.label_color),
    sharingProhibited: true,
    ...locations,
    ...webService,
  };

  const store: StoreFields = { headerFields: [], primaryFields: [], secondaryFields: [], auxiliaryFields: [], backFields: [] };

  // Zones choisies dans l'éditeur visuel (sinon : disposition automatique d'avant)
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
    rankAlerts: customer.marketing_optin,
  });
  const drawsCells =
    program.mode !== "cashback" && !["none", "fill"].includes(design.progressStyle) && (program.mode === "stamps" || design.progressStyle !== "grid");

  if (slots) {
    if (slots.top) store.headerFields.push({ ...slots.top, textAlignment: "PKTextAlignmentRight" });
    if (!drawsCells) store.primaryFields.push({ key: "big", label: labels.balance, value: state.balanceValue });
    slots.bottom.slice(0, 2).forEach((f) => f && store.secondaryFields.push(f));
    slots.bottom.slice(2, 4).forEach((f) => f && store.auxiliaryFields.push(f));
  } else {
    // Recto de la carte (disposition imposée par Apple : en-tête, bannière, puis UNE ligne de 4 champs au maximum)
    store.headerFields.push({
      key: "balance",
      label: labels.balance,
      value: state.balanceValue,
      textAlignment: "PKTextAlignmentRight",
    });
    // Le solde s'affiche en grand sur la bannière quand il n'y a pas de cases dessinées
    if (!drawsCells) store.primaryFields.push({ key: "big", label: labels.balance, value: state.balanceValue });
    store.secondaryFields.push({ key: "customer", label: labels.customer, value: customer.first_name });
    if (state.lap) {
      store.secondaryFields.push({ key: "lap", label: "RECORD", value: state.lap, changeMessage: "⏱️ Nouveau record : %@ !" });
    } else if (program.mode === "stamps") {
      store.secondaryFields.push({ key: "reward", label: labels.reward ?? "CADEAU", value: program.reward_description });
    } else if (program.mode === "points") {
      const next = catalog.find((r) => r.is_active && r.cost > card.points_balance);
      if (next) store.secondaryFields.push({ key: "next", label: `À ${next.cost} PTS`, value: next.name });
    } else {
      store.secondaryFields.push({ key: "rate", label: "CASHBACK", value: `${Number(program.cashback_percent)} %` });
    }
    if (state.tier) store.auxiliaryFields.push({ key: "tier", label: "NIVEAU", value: state.tier.name, changeMessage: "Nouveau niveau : %@ !" });
    if (state.rank) {
      store.headerFields.unshift({
        key: "rank",
        label: "CLASSEMENT",
        value: `P${state.rank.pos}`,
        ...(customer.marketing_optin ? { changeMessage: "Classement : %@" } : {}),
      });
    }
    if (state.streak) {
      store.auxiliaryFields.push({ key: "streak", label: "SÉRIE", value: `🔥 ${state.streak.count} sem.`, textAlignment: "PKTextAlignmentRight" });
    }
    if (coupons.length > 0) {
      store.auxiliaryFields.push({
        key: "offers",
        label: "OFFRES",
        value: `${coupons.length} disponible${coupons.length > 1 ? "s" : ""}`,
      });
    }
  }
  const unit = program.mode === "stamps" ? (program.progress_style === "track" ? "secteurs" : "tampons") : program.mode === "points" ? "points" : "€";
  const streakText = streakSentence(state, program.streak_bonus, unit);

  // Dos de la carte. "changeMessage" = le texte qui s'affiche en notification quand la valeur change.
  store.backFields.push({
    key: "howto",
    label: "Comment ça marche",
    value: describeProgram(program, tiers).map((r) => `${r.icon} ${r.title} : ${r.text}`).join("\n\n"),
  });
  if (streakText) {
    const best = state.streak?.best ?? 0;
    store.backFields.push({ key: "streakinfo", label: "Ta série", value: `${streakText}\nMeilleure série : ${best} semaine${best > 1 ? "s" : ""}.` });
  }
  // Notification à chaque passage : portée par le compteur (il ne change qu'en caisse), avec la phrase en message.
  // Ainsi, enregistrer le design ou reformuler les phrases n'envoie aucune notification aux clients.
  store.backFields.push(
    { key: "progress", label: "Ta progression", value: state.balanceValue, changeMessage: `${state.sentence.replace(/%/g, "%%")} (%@)` },
    { key: "status", label: "Ta carte", value: state.sentence },
    {
      key: "message",
      label: `Message de ${business.name}`,
      value: card.last_message ?? "Aucun message pour le moment.",
      ...(card.last_message ? { changeMessage: "%@" } : {}),
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
  const shareUrl = signupUrl(business.slug, card.referral_code);
  if (program.referral_bonus > 0) {
    store.backFields.push({
      key: "referral",
      label: "Parraine un ami",
      value: `Envoie ce lien à un ami : ${shareUrl}\nÀ sa première visite, tu gagnes ${program.referral_bonus} ${program.mode === "points" ? "point" : "tampon"}${program.referral_bonus > 1 ? "s" : ""} en plus.`,
      dataDetectorTypes: ["PKDataDetectorTypeLink"],
    });
  }
  if (program.lap_times_enabled) {
    store.backFields.push({
      key: "leaderboard",
      label: "Classement",
      value: `${state.rank ? `Tu es P${state.rank.pos} sur ${state.rank.total}. ` : ""}Le classement complet : ${pub}/classement/${business.slug}`,
      dataDetectorTypes: ["PKDataDetectorTypeLink"],
    });
  }
  if (business.google_review_url) {
    store.backFields.push({
      key: "review",
      label: "Ton avis compte",
      value: `Tu as aimé ? Laisse-nous un avis Google : ${business.google_review_url}`,
      dataDetectorTypes: ["PKDataDetectorTypeLink"],
    });
  }
  if (business.instagram_url) {
    store.backFields.push({
      key: "instagram",
      label: "Instagram",
      value: business.instagram_url,
      dataDetectorTypes: ["PKDataDetectorTypeLink"],
    });
  }
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
    value: `Politique de confidentialité et suppression de tes données : ${pub}/confidentialite`,
    dataDetectorTypes: ["PKDataDetectorTypeLink"],
  });

  // iOS 27 et plus : carte « poster » (photo plein format). Les iPhone plus anciens gardent la carte classique.
  const poster: PosterFields = { headerFields: [], primaryFields: [], footerFields: [], backFields: [] };
  // Disposition Apple iOS 27 : en-tête en haut à droite, QR code au milieu, champs en bas, 1 ligne de pied.
  if (slots) {
    if (slots.top) poster.headerFields.push({ ...slots.top, key: `p${slots.top.key}`, textAlignment: "PKTextAlignmentRight" });
    const primary = slots.bottom.filter((f): f is NonNullable<typeof f> => f !== null);
    primary.forEach((f, i) =>
      poster.primaryFields.push(
        i === primary.length - 1 && i > 0 ? { ...f, key: `p${f.key}`, textAlignment: "PKTextAlignmentRight" } : { ...f, key: `p${f.key}` },
      ),
    );
    if (slots.footer) poster.footerFields.push({ key: "pstatus", value: slots.footer });
  } else {
    const pf = posterFields(state, labels, customer.first_name);
    // L'alerte « classement » seulement pour les clients qui acceptent les messages
    const header = pf.header.key === "prank" && !customer.marketing_optin ? { ...pf.header, changeMessage: undefined } : pf.header;
    poster.headerFields.push({ ...header, textAlignment: "PKTextAlignmentRight" });
    pf.primary.forEach((f, i) =>
      poster.primaryFields.push(i === pf.primary.length - 1 ? { ...f, textAlignment: "PKTextAlignmentRight" } : f),
    );
    poster.footerFields.push({ key: "pstatus", value: pf.footer });
  }
  poster.backFields.push(...store.backFields.map((f) => ({ ...f, key: `p-${f.key}` })));

  return {
    props,
    store,
    poster,
    featuredActions: [{ identifier: "ma-carte", type: "viewOffersRewards", url: `${pub}/carte/${card.web_token}` }],
    barcode: { format: "PKBarcodeFormatQR", message: card.serial_number, messageEncoding: "iso-8859-1" },
    images: { showTopLogo, showName },
  };
}

/** Signe la carte (code d'origine : mêmes certificats, mêmes types de carte, même ordre). */
async function signPass(d: ApplePassDescription, files: Record<string, Buffer>): Promise<Buffer> {
  const { PKPass, PassType } = await import("passkit-generator");
  const pass = new PKPass(
    files,
    {
      wwdr: requireBase64Env("APPLE_WWDR_BASE64"),
      signerCert: requireBase64Env("APPLE_PASS_CERT_BASE64"),
      signerKey: requireBase64Env("APPLE_PASS_KEY_BASE64"),
      signerKeyPassphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || undefined,
    },
    d.props,
  );

  const store = new PassType("storeCard");
  store.headerFields.push(...d.store.headerFields);
  store.primaryFields.push(...d.store.primaryFields);
  store.secondaryFields.push(...d.store.secondaryFields);
  store.auxiliaryFields.push(...d.store.auxiliaryFields);
  store.backFields.push(...d.store.backFields);

  const poster = new PassType("posterGeneric");
  poster.headerFields.push(...d.poster.headerFields);
  poster.primaryFields.push(...d.poster.primaryFields);
  poster.footerFields.push(...d.poster.footerFields);
  poster.backFields.push(...d.poster.backFields);

  pass.types.push(poster, store);
  pass.featuredActions = d.featuredActions as typeof pass.featuredActions;
  pass.setBarcodes(d.barcode);

  return pass.getAsBuffer();
}

// Fichiers .pkpass déjà signés, en mémoire (~250 à 350 Ko chacun)
const passMemory = new ByteCache(32 * 1024 * 1024);

export type ApplePassResult = {
  buffer: Buffer;
  /** "memory" : fichier déjà prêt ; sinon images venues de "storage" (cache partagé) ou "rendered" (dessinées). */
  source: "memory" | ImageSource;
  ms: { images: number; sign: number };
};

/** Le fichier .pkpass d'une carte, le plus vite possible (cache), toujours à jour (empreinte du contenu). */
export async function getApplePass(bundle: CardBundle): Promise<ApplePassResult> {
  const d = describeApplePass(bundle);
  // L'empreinte couvre tout le contenu de la carte + ses images + le certificat utilisé pour signer
  const key = hashOf({
    d,
    images: imageKeys(bundle, "apple", d.images).path,
    cert: hashOf(process.env.APPLE_PASS_CERT_BASE64 ?? "", 16),
  });
  const hit = passMemory.get(key);
  if (hit) return { buffer: hit, source: "memory", ms: { images: 0, sign: 0 } };
  return once(`pass:${key}`, async () => {
    const t0 = performance.now();
    const { files, source } = await getPassImages(bundle, d.images);
    const t1 = performance.now();
    const buffer = await signPass(d, files);
    const t2 = performance.now();
    passMemory.set(key, buffer);
    return { buffer, source, ms: { images: Math.round(t1 - t0), sign: Math.round(t2 - t1) } };
  });
}

/** Compatibilité : même résultat qu'avant (le fichier .pkpass), désormais servi depuis le cache. */
export async function buildApplePass(bundle: CardBundle): Promise<Buffer> {
  return (await getApplePass(bundle)).buffer;
}

/** Prépare les images de la carte à l'avance (après l'inscription, après un tampon) : le clic du client sera instantané. */
export async function warmApplePass(bundle: CardBundle): Promise<ImageSource> {
  return ensurePassImages(bundle, describeApplePass(bundle).images);
}
