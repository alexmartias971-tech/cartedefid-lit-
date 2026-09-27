import "server-only";
import { pushToAppleDevices } from "@/lib/apple/push";
import { loadCardBundle } from "@/lib/cards";
import { isGoogleConfigured } from "@/lib/env";
import { addGoogleMessage, upsertGoogleObject } from "@/lib/google/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardBundle } from "@/lib/types";

type GoogleMessage = { header: string; body: string };

/** Prévient les iPhone qui ont cette carte, et supprime les iPhone qui l'ont retirée. */
async function pushApple(cardIds: string[]) {
  if (cardIds.length === 0) return;
  const supabase = createAdminClient();
  const { data } = await supabase.from("apple_device_registrations").select("push_token").in("card_id", cardIds);
  const tokens = (data ?? []).map((r: { push_token: string }) => r.push_token);
  if (tokens.length === 0) return;
  const { invalid } = await pushToAppleDevices(tokens);
  if (invalid.length > 0) {
    await supabase.from("apple_device_registrations").delete().in("push_token", invalid);
  }
}

async function pushGoogle(bundle: CardBundle, message?: GoogleMessage) {
  if (!bundle.card.google_saved || !isGoogleConfigured()) return;
  await upsertGoogleObject(bundle);
  if (message) await addGoogleMessage(bundle.card.serial_number, message.header, message.body);
}

/**
 * Met à jour une carte dans le Wallet du client, après un tampon ou un message.
 * Les erreurs sont notées dans les logs mais ne bloquent jamais le commerçant.
 */
export async function syncCard(cardId: string, googleMessage?: GoogleMessage) {
  try {
    const bundle = await loadCardBundle("id", cardId);
    if (!bundle) return;
    await Promise.allSettled([pushApple([cardId]), pushGoogle(bundle, googleMessage)]);
  } catch (err) {
    console.error("[syncCard]", (err as Error).message);
  }
}

/** Même chose pour une liste de cartes (notifications, changement de design). */
export async function syncCards(bundles: CardBundle[], googleMessage?: GoogleMessage) {
  const results = { apple: 0, google: 0, errors: 0 };
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
