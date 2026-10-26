import "server-only";
import { pushToAppleDevices } from "@/lib/apple/push";
import { loadCardBundle } from "@/lib/cards";
import { isGoogleConfigured } from "@/lib/env";
import { addGoogleMessage, upsertGoogleObject } from "@/lib/google/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardBundle } from "@/lib/types";
import { warmWallet } from "@/lib/wallet-warm";

type GoogleMessage = { header: string; body: string };

/** Attend une tâche au plus `ms` millisecondes (la suite ne doit jamais rester bloquée). */
function atMost(task: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([task.catch(() => null), new Promise((resolve) => setTimeout(resolve, ms))]);
}

/** Prévient les iPhone qui ont cette carte, et supprime les iPhone qui l'ont retirée. Renvoie le nombre d'iPhone prévenus. */
async function pushApple(cardIds: string[]): Promise<number> {
  if (cardIds.length === 0) return 0;
  const supabase = createAdminClient();
  const { data } = await supabase.from("apple_device_registrations").select("push_token").in("card_id", cardIds);
  const tokens = (data ?? []).map((r: { push_token: string }) => r.push_token);
  if (tokens.length === 0) return 0;
  const { sent, invalid } = await pushToAppleDevices(tokens);
  if (invalid.length > 0) {
    await supabase.from("apple_device_registrations").delete().in("push_token", invalid);
  }
  return sent;
}

/** Met la carte Google à jour ; true si un message avec notification a été posé. */
async function pushGoogle(bundle: CardBundle, message?: GoogleMessage): Promise<boolean> {
  if (!bundle.card.google_saved || !isGoogleConfigured()) return false;
  await upsertGoogleObject(bundle);
  if (!message) return false;
  await addGoogleMessage(bundle.card.serial_number, message.header, message.body);
  return true;
}

/** Ce qui a réellement été envoyé : nombre d'iPhone prévenus (APNs a accepté), message Google posé. */
export type SyncOutcome = { apple: number; google: boolean };

/**
 * Met à jour une carte dans le Wallet du client, après un tampon ou un message.
 * Les erreurs sont notées dans les logs mais ne bloquent jamais le commerçant.
 */
export async function syncCard(cardId: string, googleMessage?: GoogleMessage): Promise<SyncOutcome | null> {
  try {
    const bundle = await loadCardBundle("id", cardId);
    if (!bundle) return null;
    // Les nouvelles images d'abord (8 s au plus) : l'iPhone qui va être prévenu trouvera la carte prête
    await atMost(warmWallet(bundle), 8000);
    const [apple, google] = await Promise.allSettled([pushApple([cardId]), pushGoogle(bundle, googleMessage)]);
    if (apple.status === "rejected") console.error("[syncCard apple]", (apple.reason as Error)?.message ?? apple.reason);
    if (google.status === "rejected") console.error("[syncCard google]", (google.reason as Error)?.message ?? google.reason);
    return {
      apple: apple.status === "fulfilled" ? apple.value : 0,
      google: google.status === "fulfilled" && google.value,
    };
  } catch (err) {
    console.error("[syncCard]", (err as Error).message);
    return null;
  }
}

/** Même chose pour une liste de cartes (notifications, changement de design). */
export async function syncCards(bundles: CardBundle[], googleMessage?: GoogleMessage) {
  const results = { apple: 0, google: 0, errors: 0 };
  // Images d'abord, seulement pour les cartes déjà dans un Wallet (ce sont elles que les téléphones vont redemander),
  // 3 à la fois (les cartes au même point partagent les mêmes images), 6 s au plus : l'envoi n'attend jamais longtemps.
  const inWallet = bundles.filter((b) => b.card.wallet_platform === "apple" || b.card.google_saved);
  await atMost(
    (async () => {
      for (let i = 0; i < inWallet.length; i += 3) {
        await Promise.allSettled(
          inWallet.slice(i, i + 3).map((b) => warmWallet(b, { apple: b.card.wallet_platform === "apple", google: b.card.google_saved })),
        );
      }
    })(),
    6000,
  );
  try {
    await pushApple(bundles.map((b) => b.card.id));
    results.apple = bundles.length;
  } catch (err) {
    results.errors++;
    console.error("[syncCards apple]", (err as Error).message);
  }
  // Google : 5 cartes à la fois pour ne pas dépasser les limites
  for (let i = 0; i < bundles.length; i += 5) {
    const slice = bundles.slice(i, i + 5);
    const settled = await Promise.allSettled(slice.map((b) => pushGoogle(b, googleMessage)));
    settled.forEach((s) => {
      if (s.status === "fulfilled") results.google++;
      else {
        results.errors++;
        console.error("[syncCards google]", s.reason);
      }
    });
  }
  return results;
}
