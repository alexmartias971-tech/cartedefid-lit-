import "server-only";
import { primaryLogoPng, primaryNamePng, squareLogoPng, wideLogoPng } from "@/lib/logo";
import { renderCardPoster, renderCardStrip } from "@/lib/strip";
import type { CardBundle } from "@/lib/types";
import { PASS_BUDGET } from "@/lib/wallet-image-settings";

/**
 * Les images du fichier .pkpass, fabriquées UNE fois par état de carte (puis gardées en cache).
 *
 * Tailles choisies (oct. 2026) :
 *  - Icône : icon.png + @2x + @3x (Apple demande icon.png ; quelques Ko).
 *  - Logos (logo, primaryLogo) : @2x et @3x (iPhone @2x / @3x, Apple Watch @2x), toujours nets.
 *  - Photos (strip = carte classique jusqu'à iOS 26, artwork = carte poster iOS 27) : @2x, la taille que TOUS les iPhone
 *    savent utiliser (un iPhone @3x l'agrandit). Le @3x est ajouté en plus quand il tient dans le budget du fichier
 *    (fonds unis, dessins, photos légères) : la carte reste alors pixel pour pixel.
 *  - Plus aucune image @1x pour les photos : aucun iPhone récent ni Apple Watch n'en a l'usage.
 * Avant : 15 images (dont 3 tailles de chaque photo), 0,8 à 1,2 Mo. Après : ~250 à 350 Ko.
 */

// Les champs, le manifeste et la signature font ~10 Ko
const JSON_OVERHEAD = 12 * 1024;

export type PassImageFlags = { showTopLogo: boolean; showName: boolean };

export async function renderPassImages(bundle: CardBundle, flags: PassImageFlags): Promise<Record<string, Buffer>> {
  const { business, program } = bundle;
  const none = Promise.resolve(null);
  const [strip2, art2, icon1, icon2, icon3, logo2, logo3, plogo2, plogo3] = await Promise.all([
    renderCardStrip(bundle, 2),
    // iOS 27 : carte « poster » avec la photo sur toute la carte (358 × 448 points)
    renderCardPoster(bundle, 2),
    // Icône : 38 × 38 points (guide Apple, juin 2026)
    squareLogoPng(business, program, 38),
    squareLogoPng(business, program, 76),
    squareLogoPng(business, program, 114),
    flags.showTopLogo ? wideLogoPng(business, program, 2) : none,
    flags.showTopLogo ? wideLogoPng(business, program, 3) : none,
    // iOS 27 n'affiche pas de texte à côté du logo : sans logo, on écrit le nom en image
    flags.showTopLogo ? primaryLogoPng(business, 2) : flags.showName ? primaryNamePng(business, program, 2) : none,
    flags.showTopLogo ? primaryLogoPng(business, 3) : flags.showName ? primaryNamePng(business, program, 3) : none,
  ]);

  const files: Record<string, Buffer> = {
    "icon.png": icon1,
    "icon@2x.png": icon2,
    "icon@3x.png": icon3,
    ...(logo2 && logo3 ? { "logo@2x.png": logo2, "logo@3x.png": logo3 } : {}),
    "strip@2x.png": strip2,
    "artwork@2x.png": art2,
    ...(plogo2 && plogo3 ? { "primaryLogo@2x.png": plogo2, "primaryLogo@3x.png": plogo3 } : {}),
  };

  // Le @3x des photos, seulement s'il garde le fichier léger (priorité à la carte iOS 27, la plus grande)
  let total = JSON_OVERHEAD + Object.values(files).reduce((n, b) => n + b.length, 0);
  const addIfFits = async (name: string, predicted: number, make: () => Promise<Buffer>) => {
    if (total + predicted > PASS_BUDGET) return;
    const buf = await make();
    if (total + buf.length > PASS_BUDGET) return;
    files[name] = buf;
    total += buf.length;
  };
  // Un @3x pèse environ 2 fois le @2x (2,25 fois plus de pixels, un peu mieux compressés)
  await addIfFits("artwork@3x.png", art2.length * 2, () => renderCardPoster(bundle, 3));
  await addIfFits("strip@3x.png", strip2.length * 2, () => renderCardStrip(bundle, 3));
  return files;
}
