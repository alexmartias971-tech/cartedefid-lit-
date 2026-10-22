import type { PngOptions } from "sharp";

/**
 * Réglages des images Wallet, réunis ici. Ils font partie de l'empreinte du cache (wallet-images.ts) :
 * si on en change un, toutes les images sont refaites automatiquement, sans rien vider à la main.
 */

/**
 * Visuels photo (bannière, carte poster iOS 27) : palette de 256 couleurs (3 à 4 fois plus léger qu'un PNG classique),
 * tramage un peu réduit (fichier plus léger, dégradés toujours lisses). Vérifié à l'œil sur des cartes réelles (oct. 2026).
 */
export const PHOTO_PNG: PngOptions = { palette: true, quality: 92, effort: 7, dither: 0.6, compressionLevel: 9 };

/** Icône et logos : palette de 256 couleurs au maximum, qualité maximale (un logo a peu de couleurs : rendu identique). */
export const LOGO_PNG: PngOptions = { palette: true, quality: 100, effort: 7, compressionLevel: 9 };

/**
 * Poids maximum visé pour tout le fichier .pkpass (~4G faible : 350 Ko ≈ 1 à 3 s).
 * Les photos sont toujours fournies en @2x ; leur version @3x est ajoutée quand elle tient dans ce budget.
 * Pour avoir les photos en @3x partout (fichier ~0,8 à 1 Mo), mettre par exemple 1100 * 1024.
 */
export const PASS_BUDGET = 340 * 1024;
