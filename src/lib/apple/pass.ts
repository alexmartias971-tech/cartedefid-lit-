import "server-only";
import { PKPass, PassType } from "passkit-generator";
import { appUrl, requireBase64Env, requireEnv } from "@/lib/env";
import { computeCardState, describeProgram, designFromProgram, fieldLabels, posterFields, resolveSlots, streakSentence } from "@/lib/card-state";
import { hexToRgb } from "@/lib/format";
import { primaryLogoPng, squareLogoPng, wideLogoPng } from "@/lib/logo";
import { renderCardPoster, renderCardStrip } from "@/lib/strip";
import type { CardBundle } from "@/lib/types";

/**
 * Fabrique le fichier .pkpass (la carte Apple Wallet) d'un client.
 * Chaque fois qu'une carte change (tampon, notification), Apple rappelle
 * notre serveur et on refabrique ce fichier avec les nouvelles valeurs.
 */
export async function buildApplePass(bundle: CardBundle): Promise<Buffer> {
  const { card, customer, program, business, tiers, catalog, coupons } = bundle;
  const state = computeCardState(program, card, tiers, catalog);
  const design = designFromProgram(program);
  const labels = fieldLabels(design, state);
  const [strip1, strip2, strip3, icon1, icon2, icon3, logo1, logo2, logo3, art1, art2, art3, plogo1, plogo2, plogo3] = await Promise.all([
    renderCardStrip(bundle, 1),
    renderCardStrip(bundle, 2),
    renderCardStrip(bundle, 3),
    squareLogoPng(business, program, 29),
    squareLogoPng(business, program, 58),
    squareLogoPng(business, program, 87),
    wideLogoPng(business, program, 1),
    wideLogoPng(business, program, 2),
    wideLogoPng(business, program, 3),
    // iOS 27 : carte « poster » avec la photo sur toute la carte (358 × 448 points)
    renderCardPoster(bundle, 1),
    renderCardPoster(bundle, 2),
    renderCardPoster(bundle, 3),
    primaryLogoPng(business, 1),
    primaryLogoPng(business, 2),
    primaryLogoPng(business, 3),
  ]);

  const url = appUrl();
  // Apple exige une adresse https pour les mises à jour automatiques.
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
      "artwork.png": art1,
      "artwork@2x.png": art2,
      "artwork@3x.png": art3,
      ...(plogo1 && plogo2 && plogo3
        ? { "primaryLogo.png": plogo1, "primaryLogo@2x.png": plogo2, "primaryLogo@3x.png": plogo3 }
        : {}),
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
      ...(design.showLogoText ? { logoText: business.name } : {}),
      backgroundColor: hexToRgb(state.tier?.color || program.background_color),
      foregroundColor: hexToRgb(program.foreground_color),
      labelColor: hexToRgb(program.label_color),
      sharingProhibited: true,
      ...locations,
      ...webService,
    },
  );

  const store = new PassType("storeCard");

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
    // Recto de la carte (la disposition est imposée par Apple : en-tête, bannière, 2 lignes de champs)
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
  const unit = program.mode === "stamps" ? "tampon(s)" : program.mode === "points" ? "points" : "€";
  const streakText = streakSentence(state, program.streak_bonus, unit);

  // Dos de la carte. "changeMessage" = le texte qui s'affiche en notification quand la valeur change.
  store.backFields.push({
    key: "howto",
    label: "Comment ça marche",
    value: describeProgram(program, tiers).map((r) => `${r.icon} ${r.title} : ${r.text}`).join("\n\n"),
  });
  if (streakText) store.backFields.push({ key: "streakinfo", label: "Ta série", value: `${streakText}\nMeilleure série : ${state.streak?.best ?? 0} semaine(s).` });
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
  const shareUrl = `${url}/c/${business.slug}?p=${card.referral_code}`;
  if (program.referral_bonus > 0) {
    store.backFields.push({
      key: "referral",
      label: "Parraine un ami",
      value: `Envoie ce lien à un ami : ${shareUrl}\nÀ sa première visite, tu gagnes ${program.referral_bonus} ${program.mode === "points" ? "points" : "tampon(s)"} en plus.`,
      dataDetectorTypes: ["PKDataDetectorTypeLink"],
    });
  }
  if (program.lap_times_enabled) {
    store.backFields.push({
      key: "leaderboard",
      label: "Classement",
      value: `${state.rank ? `Tu es P${state.rank.pos} sur ${state.rank.total}. ` : ""}Le classement complet : ${url}/classement/${business.slug}`,
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

  // iOS 27 et plus : carte « poster » (photo plein format). Les iPhone plus anciens gardent la carte classique.
  const poster = new PassType("posterGeneric");
  // Disposition Apple iOS 27 : en-tête en haut à droite, QR code au milieu, champs en bas, 1 ligne de pied.
  if (slots) {
    if (slots.top) poster.headerFields.push({ ...slots.top, key: `p${slots.top.key}`, textAlignment: "PKTextAlignmentRight" });
    const primary = slots.bottom.filter((f): f is NonNullable<typeof f> => f !== null);
    primary.forEach((f, i) =>
      poster.primaryFields.push(
        i === primary.length - 1 && i > 0 ? { ...f, key: `p${f.key}`, textAlignment: "PKTextAlignmentRight" } : { ...f, key: `p${f.key}` },
      ),
    );
    if (slots.footer) poster.footerFields.push({ key: "pstatus", value: slots.footer, changeMessage: "%@" });
  } else {
    const pf = posterFields(state, labels, customer.first_name);
    // L'alerte « classement » seulement pour les clients qui acceptent les messages
    const header = pf.header.key === "prank" && !customer.marketing_optin ? { ...pf.header, changeMessage: undefined } : pf.header;
    poster.headerFields.push({ ...header, textAlignment: "PKTextAlignmentRight" });
    pf.primary.forEach((f, i) =>
      poster.primaryFields.push(i === pf.primary.length - 1 ? { ...f, textAlignment: "PKTextAlignmentRight" } : f),
    );
    poster.footerFields.push({ key: "pstatus", value: pf.footer, changeMessage: "%@" });
  }
  poster.backFields.push(...store.backFields.map((f) => ({ ...f, key: `p-${f.key}` })));

  pass.types.push(poster, store);
  pass.featuredActions = [{ identifier: "ma-carte", type: "viewOffersRewards", url: `${url}/carte/${card.web_token}` }];
  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: card.serial_number,
    messageEncoding: "iso-8859-1",
    altText: customer.first_name,
  });

  return pass.getAsBuffer();
}
