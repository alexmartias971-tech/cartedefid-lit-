"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCard } from "@/lib/wallet-sync";

/** ok : le nom est corrigé (prenom, nom = ce qui est enregistré). error : un message à corriger. */
export type NomState = { ok?: boolean; error?: string; prenom?: string; nom?: string };

/** Un prénom ou un nom propre : sans caractères invisibles, espaces simples, 60 caractères au plus. */
const propre = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

/** Ce qui n'a rien à faire dans un prénom ou un nom (chiffres, adresses, symboles) : il s'affiche sur la carte Wallet. */
const INTERDIT = /[0-9@<>/\\{}[\]=_#$%^*|~`+:;!?"()&]|https?|www\./i;

/**
 * Le client corrige son prénom ou son nom depuis la page de sa carte (demande d'Alexandre, 25 oct. 2026 : « Alecandre » au lieu
 * d'« Alexandre », une faute de frappe à l'inscription). Le lien de la carte (web_token) est son accès : c'est la même clé que
 * pour voir sa carte. La carte Wallet suit : la date de la carte change, l'iPhone et Google la redemandent avec le bon prénom.
 */
export async function corrigerNom(_prev: NomState, fd: FormData): Promise<NomState> {
  const token = String(fd.get("token") ?? "");
  if (!/^[0-9a-f]{32}$/.test(token)) return { error: "Carte introuvable : rouvre-la depuis ton lien." };
  const prenom = propre(fd.get("first_name"));
  const nom = propre(fd.get("last_name"));
  if (!prenom) return { error: "Indique ton prénom." };
  if (!nom) return { error: "Indique ton nom." };
  if (INTERDIT.test(prenom) || INTERDIT.test(nom)) {
    return { error: "Seulement des lettres : les espaces, tirets et apostrophes sont acceptés." };
  }

  // (une panne ne doit jamais casser la page : le client garde ce qu'il a tapé et peut réessayer)
  let cardId: string;
  try {
    const supabase = createAdminClient();
    const { data: card } = await supabase.from("cards").select("id, customer_id").eq("web_token", token).maybeSingle();
    if (!card) return { error: "Carte introuvable : rouvre-la depuis ton lien." };
    const { error } = await supabase.from("customers").update({ first_name: prenom, last_name: nom }).eq("id", card.customer_id);
    if (error) throw new Error(error.message);
    // La carte « change » (updated_at, mis à jour par la base) : le Wallet du client la redemande avec le nouveau prénom
    await supabase.from("cards").update({ updated_at: new Date().toISOString() }).eq("id", card.id);
    cardId = card.id;
  } catch (err) {
    console.error("[corrigerNom]", (err as Error).message);
    return { error: "La modification n'a pas marché. Réessaie dans un instant." };
  }
  after(() => syncCard(cardId));
  revalidatePath(`/carte/${token}`);
  return { ok: true, prenom, nom };
}
