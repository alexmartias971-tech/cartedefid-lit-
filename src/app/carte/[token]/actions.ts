"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { estMaCarte, memeContact, retenirCarte } from "@/lib/carte-acces";
import { EMAIL_OK } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCard } from "@/lib/wallet-sync";

type CarteLiee = { id: string; customer_id: string; loyalty_programs: { business_id: string } };
const CARTE_LIEE = "id, customer_id, loyalty_programs!inner(business_id)";

export type OuvrirState = { error?: string };

/**
 * Un téléphone sans le cookie de la carte l'ouvre en redonnant le numéro ou l'e-mail de l'inscription.
 * shortcut: pas de compteur d'essais (aucune table à modifier), 0,5 s d'attente par erreur ; ajouter une règle Vercel Firewall si des essais en masse apparaissent.
 */
export async function ouvrirCarte(_prev: OuvrirState, fd: FormData): Promise<OuvrirState> {
  const token = String(fd.get("token") ?? "");
  const refus = { error: "Ce numéro ou cet e-mail ne correspond pas à cette carte." };
  if (!/^[0-9a-f]{32}$/.test(token)) return refus;
  const contact = String(fd.get("contact") ?? "").slice(0, 120);
  const { data } = await createAdminClient()
    .from("cards")
    .select("customers!inner(phone, email), loyalty_programs!inner(business_id)")
    .eq("web_token", token)
    .maybeSingle();
  const carte = data as unknown as { customers: { phone: string | null; email: string | null }; loyalty_programs: { business_id: string } } | null;
  if (!carte || !memeContact(contact, carte.customers.phone, carte.customers.email)) {
    await new Promise((r) => setTimeout(r, 500));
    return refus;
  }
  await retenirCarte(carte.loyalty_programs.business_id, token);
  redirect(`/carte/${token}`);
}

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
    const { data } = await supabase.from("cards").select(CARTE_LIEE).eq("web_token", token).maybeSingle();
    const card = data as unknown as CarteLiee | null;
    if (!card || !(await estMaCarte(card.loyalty_programs.business_id, token))) return { error: "Carte introuvable : rouvre-la depuis ton lien." };
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

/** ok : le client recevra les bons plans par e-mail. error : un message à corriger. */
export type EmailState = { ok?: boolean; error?: string; email?: string };

/**
 * Le client qui n'a pas la carte dans son téléphone laisse son e-mail pour recevoir les bons plans du commerce
 * (relance sans Wallet, 29 oct. 2026, lib/email.ts). Case à cocher obligatoire, jamais cochée d'avance : c'est son accord
 * pour les bons plans de CE commerce, par e-mail et sur sa carte. Le lien de la carte (web_token) est son accès.
 */
export async function recevoirEmails(_prev: EmailState, fd: FormData): Promise<EmailState> {
  const token = String(fd.get("token") ?? "");
  if (!/^[0-9a-f]{32}$/.test(token)) return { error: "Carte introuvable : rouvre-la depuis ton lien." };
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_OK.test(email)) return { error: "Vérifie ton adresse e-mail (exemple : prenom@gmail.com)." };
  if (fd.get("accord") !== "on") return { error: "Coche la case pour recevoir les bons plans par e-mail." };
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from("cards").select(CARTE_LIEE).eq("web_token", token).maybeSingle();
    const card = data as unknown as CarteLiee | null;
    if (!card || !(await estMaCarte(card.loyalty_programs.business_id, token))) return { error: "Carte introuvable : rouvre-la depuis ton lien." };
    const { error } = await supabase.from("email_optins").upsert(
      { customer_id: card.customer_id, email, source: "carte", consented_at: new Date().toISOString(), unsubscribed_at: null },
      { onConflict: "customer_id" },
    );
    if (error) throw new Error(error.message);
    // son accord pour les bons plans de ce commerce (la case qu'il n'avait peut-être pas cochée à l'inscription)
    await supabase.from("customers").update({ marketing_optin: true }).eq("id", card.customer_id);
  } catch (err) {
    console.error("[recevoirEmails]", (err as Error).message);
    return { error: "L'enregistrement n'a pas marché. Réessaie dans un instant." };
  }
  revalidatePath(`/carte/${token}`);
  return { ok: true, email };
}
