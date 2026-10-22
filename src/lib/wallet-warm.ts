import "server-only";
import { warmApplePass } from "@/lib/apple/pass";
import { loadCardBundle } from "@/lib/cards";
import { isAppleConfigured, isGoogleConfigured } from "@/lib/env";
import type { CardBundle } from "@/lib/types";
import { ensureGoogleHero } from "@/lib/wallet-images";

/**
 * Prépare à l'avance les images Wallet d'une carte (Apple et/ou Google) :
 * quand le téléphone viendra chercher la carte, tout sera déjà prêt (réponse en moins d'une seconde).
 * Les images sont partagées entre toutes les cartes au même point : souvent, il n'y a rien à dessiner.
 * (Module léger : pas de bibliothèque Google ni de dessin chargés tant qu'il n'y a rien à faire.)
 */
export async function warmWallet(bundle: CardBundle, which: { apple?: boolean; google?: boolean } = {}): Promise<void> {
  const apple = which.apple ?? bundle.card.wallet_platform !== "google";
  const google = which.google ?? bundle.card.google_saved;
  const jobs: Promise<unknown>[] = [];
  if (apple && isAppleConfigured()) jobs.push(warmApplePass(bundle));
  if (google && isGoogleConfigured()) jobs.push(ensureGoogleHero(bundle));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.warn("[warmWallet]", (r.reason as Error)?.message ?? r.reason);
}

/** Même chose à partir de l'identifiant de la carte (juste après l'inscription). */
export async function warmCard(cardId: string, which: { apple: boolean; google: boolean } = { apple: true, google: true }): Promise<void> {
  try {
    const bundle = await loadCardBundle("id", cardId);
    if (bundle) await warmWallet(bundle, which);
  } catch (err) {
    console.warn("[warmCard]", (err as Error).message);
  }
}
