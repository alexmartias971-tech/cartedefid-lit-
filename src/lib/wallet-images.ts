import "server-only";
import { computeCardState, designFromProgram, stripProgress } from "@/lib/card-state";
import { renderFingerprint } from "@/lib/render-fingerprint";
import type { CardBundle } from "@/lib/types";
import { ByteCache, CACHE_BUCKET, hashOf, inBackground, once, packFiles, pruneFolder, storageGet, storagePut, unpackFiles } from "@/lib/wallet-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PassImageFlags } from "@/lib/apple/pass-images";
import { LOGO_PNG, PASS_BUDGET, PHOTO_PNG } from "@/lib/wallet-image-settings";

/**
 * Images des cartes Wallet, avec cache.
 *
 * Toutes les cartes d'un même programme qui en sont au même point (même nombre de tampons, même niveau)
 * ont EXACTEMENT les mêmes images : on les dessine une seule fois, puis tout le monde les réutilise.
 * Rangement dans le compartiment « pass-cache » : sets/<programme>/<version du design>-<état>.bin
 * Quand le commerçant change son design, la « version » change : les anciennes images sont supprimées au passage.
 *
 * À changer à la main seulement si on modifie la FABRICATION des images (strip.ts, logo.ts, pass-images.ts) :
 * le dessin lui-même (visual.ts, art.ts, card-state.ts) est surveillé automatiquement (render-fingerprint.ts),
 * et les réglages PNG / budget aussi (wallet-image-settings.ts).
 */
export const IMAGES_VERSION = "2026-10-20.1";

const setMemory = new ByteCache(48 * 1024 * 1024);

export type ImageSource = "memory" | "storage" | "rendered";

/** Clés de cache des images d'une carte (rien n'est téléchargé ni dessiné ici). */
export function imageKeys(bundle: CardBundle, kind: "apple" | "google", flags?: PassImageFlags) {
  const { program, business, tiers, card, catalog } = bundle;
  const state = computeCardState(program, card, tiers, catalog);
  const progress = stripProgress(program.mode, state, card, catalog);
  // Tout ce qui change le dessin pour TOUTES les cartes du programme
  const version = hashOf(
    {
      v: IMAGES_VERSION,
      engine: renderFingerprint(),
      settings: [PHOTO_PNG, LOGO_PNG, PASS_BUDGET],
      design: designFromProgram(program),
      tiers: tiers.map((t) => [t.id, t.color, t.image_url]),
      business: [business.name, business.logo_url],
    },
    16,
  );
  // Ce qui change d'une carte à l'autre : la progression et le niveau
  const state16 = hashOf({ version, kind, flags: flags ?? null, progress, tier: state.tier?.id ?? null }, 16);
  const folder = `sets/${program.id}`;
  const path = kind === "apple" ? `${folder}/${version}-${state16}.bin` : `${folder}/${version}-${state16}-g.png`;
  return { version, key: `${kind}:${state16}`, folder, path };
}

async function saveToStorage(keys: ReturnType<typeof imageKeys>, body: Buffer, contentType: string) {
  await storagePut(keys.path, body, contentType);
  await pruneFolder(keys.folder, `${keys.version}-`);
}

/** Images du fichier .pkpass d'une carte : mémoire → cache partagé → dessin. */
export async function getPassImages(
  bundle: CardBundle,
  flags: PassImageFlags,
): Promise<{ files: Record<string, Buffer>; source: ImageSource; key: string }> {
  const keys = imageKeys(bundle, "apple", flags);
  const mem = setMemory.get(keys.key);
  const memFiles = mem && unpackFiles(mem);
  if (memFiles) return { files: memFiles, source: "memory", key: keys.key };
  return once(`img:${keys.key}`, async () => {
    const stored = await storageGet(keys.path);
    const storedFiles = stored && unpackFiles(stored);
    if (stored && storedFiles) {
      setMemory.set(keys.key, stored);
      return { files: storedFiles, source: "storage" as const, key: keys.key };
    }
    const { renderPassImages } = await import("@/lib/apple/pass-images");
    const files = await renderPassImages(bundle, flags);
    const packed = packFiles(files);
    setMemory.set(keys.key, packed);
    await inBackground(() => saveToStorage(keys, packed, "application/octet-stream"));
    return { files, source: "rendered" as const, key: keys.key };
  });
}

/** Image « héros » de la carte Google (1032 px de large), avec le même cache. */
export async function getGoogleHero(bundle: CardBundle): Promise<{ png: Buffer; source: ImageSource }> {
  const keys = imageKeys(bundle, "google");
  const mem = setMemory.get(keys.key);
  if (mem) return { png: mem, source: "memory" };
  return once(`img:${keys.key}`, async () => {
    const stored = await storageGet(keys.path);
    if (stored && stored.length > 0) {
      setMemory.set(keys.key, stored);
      return { png: stored, source: "storage" as const };
    }
    const { renderCardStrip } = await import("@/lib/strip");
    const png = await renderCardStrip(bundle, 3, "google");
    setMemory.set(keys.key, png);
    await inBackground(() => saveToStorage(keys, png, "image/png"));
    return { png, source: "rendered" as const };
  });
}

/** Images dont on sait déjà qu'elles sont dans le cache partagé (évite de redemander pour chaque carte). */
const known = new Set<string>();

/** Vérifie seulement que les images existent (sans les télécharger) ; les dessine sinon. Pour préparer à l'avance. */
async function ensure(keys: ReturnType<typeof imageKeys>, make: () => Promise<unknown>): Promise<ImageSource> {
  if (setMemory.get(keys.key)) return "memory";
  if (known.has(keys.path)) return "storage";
  try {
    const { data } = await createAdminClient().storage.from(CACHE_BUCKET).exists(keys.path);
    if (data) {
      if (known.size > 5000) known.clear();
      known.add(keys.path);
      return "storage";
    }
  } catch {
    // on dessine
  }
  await make();
  return "rendered";
}

export function ensurePassImages(bundle: CardBundle, flags: PassImageFlags): Promise<ImageSource> {
  return ensure(imageKeys(bundle, "apple", flags), () => getPassImages(bundle, flags));
}

export function ensureGoogleHero(bundle: CardBundle): Promise<ImageSource> {
  return ensure(imageKeys(bundle, "google"), () => getGoogleHero(bundle));
}
