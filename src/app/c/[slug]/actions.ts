"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { normalizePhone, phoneVariants } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { warmCard } from "@/lib/wallet-warm";

/**
 * error : un message à corriger. retrouver : ce client a déjà une carte (même téléphone ou e-mail) mais le prénom tapé
 * ne correspond pas ; on l'aide à la retrouver (indice du prénom enregistré : première et dernière lettre, nombre de lettres).
 */
export type SignupState = { error?: string; retrouver?: { indice: string; lettres: number } };
// v4 (25 oct. 2026) : le nom est demandé avec le prénom ; v3 (23 oct.) : plus de date de naissance (page confidentialité à jour)
const POLICY_VERSION = "v4";

/** Prénom sans accents, majuscules, espaces ni tirets : « Jean-Éric » → « jeaneric ». */
const simple = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Nombre de lettres à changer pour passer d'un mot à l'autre (Levenshtein ; les prénoms sont courts). */
function ecart(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Le prénom tapé est-il celui de l'inscription ? « Alex » retrouve « Alexandre » (début), et une faute de frappe est
 * tolérée, deux pour un prénom de 6 lettres ou plus : « Alexandre » retrouve « Alecandre ».
 */
function memePrenom(tape: string, connu: string): boolean {
  if (!tape || !connu) return false;
  if (tape === connu) return true;
  if (tape.length >= 3 && connu.length >= 3 && (connu.startsWith(tape) || tape.startsWith(connu))) return true;
  const court = Math.min(tape.length, connu.length);
  return court >= 3 && ecart(tape, connu) <= (court >= 6 ? 2 : 1);
}

/** Indice du prénom enregistré, sans le dévoiler : « Alecandre » → « A•••••••e ». */
function indicePrenom(prenom: string | null | undefined): { indice: string; lettres: number } {
  const lettres = [...(prenom ?? "").trim()].filter((c) => /\p{L}/u.test(c));
  if (lettres.length === 0) return { indice: "•••", lettres: 0 };
  const premiere = lettres[0].toUpperCase();
  if (lettres.length <= 2) return { indice: `${premiere}•`, lettres: lettres.length };
  return { indice: `${premiere}${"•".repeat(lettres.length - 2)}${lettres[lettres.length - 1].toLowerCase()}`, lettres: lettres.length };
}

/** Inscription d'un client depuis le QR code du comptoir. */
export async function registerCustomer(slug: string, _prev: SignupState, fd: FormData): Promise<SignupState> {
  // Champ piège invisible : seuls les robots le remplissent
  if (String(fd.get("site_web") ?? "")) return { error: "Inscription refusée." };

  const firstName = String(fd.get("first_name") ?? "")
    .trim()
    .slice(0, 60);
  const lastName =
    String(fd.get("last_name") ?? "")
      .trim()
      .slice(0, 60) || null;
  const email =
    String(fd.get("email") ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 120) || null;
  const phoneRaw = String(fd.get("phone") ?? "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw).slice(0, 20) : null;
  const privacy = fd.get("privacy") === "on";
  const marketing = fd.get("marketing") === "on";
  const leaderboard = fd.get("leaderboard") === "on";

  if (!firstName) return { error: "Indique ton prénom." };
  if (!lastName) return { error: "Indique ton nom." };
  if (!email && !phone) return { error: "Indique ton email ou ton téléphone." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "L'email ne semble pas valide." };
  if (phone && phone.replace(/\D/g, "").length < 9) return { error: "Le téléphone ne semble pas valide." };
  if (!privacy) return { error: "Coche la case pour confirmer que tu as lu comment tes données sont utilisées." };

  const supabase = createAdminClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, status, loyalty_programs(id, is_active, welcome_offer, mode, reward_threshold, signup_bonus)")
    .eq("slug", slug)
    .maybeSingle();
  type ProgramRow = {
    id: string;
    is_active: boolean;
    welcome_offer: string | null;
    mode: "stamps" | "points" | "cashback";
    reward_threshold: number;
    signup_bonus: number;
  };
  const program = (business?.loyalty_programs as unknown as ProgramRow | null) ?? null;
  if (!business || business.status !== "active" || !program?.is_active) {
    return { error: "Ce programme de fidélité n'est pas disponible." };
  }

  // Déjà inscrit (même email ou même téléphone) ? On renvoie sa carte existante.
  type Existing = { id: string; first_name: string | null; cards: { web_token: string }[] };
  let existing = null as Existing | null;
  for (const [column, value] of [
    ["email", email],
    ["phone", phone],
  ] as const) {
    if (existing || !value) continue;
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, cards(web_token)")
      .eq("business_id", business.id)
      .in(column, column === "phone" ? phoneVariants(value) : [value])
      .limit(1)
      .maybeSingle();
    existing = (data as Existing | null) ?? null;
  }
  // Déjà une carte : on la redonne directement si le prénom correspond aussi (« Alex » retrouve « Alexandre », une faute de
  // frappe est tolérée). Choix d'Alexandre (15 oct. 2026) : numéro + prénom suffisent, pour que le client la retrouve seul.
  // Sinon (25 oct.) : jamais d'impasse. On l'aide avec un indice du prénom enregistré, et la caisse peut lui renvoyer sa carte.
  const existingCard = existing?.cards?.[0];
  if (existingCard) {
    if (memePrenom(simple(firstName), simple(existing?.first_name))) redirect(`/carte/${existingCard.web_token}?deja=1`);
    return { retrouver: indicePrenom(existing?.first_name) };
  }

  let customerId = existing?.id;
  if (!customerId) {
    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        business_id: business.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        marketing_optin: marketing,
        leaderboard_optin: leaderboard,
      })
      .select("id")
      .single();
    if (error || !customer) return { error: "Inscription impossible pour le moment. Réessaie dans un instant." };
    customerId = customer.id;

    await supabase.from("consents").insert([
      { customer_id: customerId, consent_type: "privacy_policy", granted: true, policy_version: POLICY_VERSION },
      {
        customer_id: customerId,
        consent_type: "marketing_notifications",
        granted: marketing,
        policy_version: POLICY_VERSION,
      },
    ]);
  }

  // Parrainage : le lien d'un ami contient son code (?p=CODE)
  const refCode = String(fd.get("ref") ?? "").trim().toUpperCase();
  let referredBy: string | null = null;
  if (/^[0-9A-F]{8}$/.test(refCode)) {
    const { data: referrer } = await supabase
      .from("cards")
      .select("id")
      .eq("program_id", program.id)
      .eq("referral_code", refCode)
      .maybeSingle();
    referredBy = referrer?.id ?? null;
  }

  // Bonus d'inscription : la carte démarre déjà un peu remplie (effet « progrès offert »)
  const bonus = Math.max(0, program.signup_bonus ?? 0);
  const start =
    program.mode === "stamps"
      ? { stamps_count: Math.min(bonus, Math.max(0, program.reward_threshold - 1)) }
      : program.mode === "points"
        ? { points_balance: bonus, lifetime_points: bonus }
        : {};

  const { data: card, error: cardError } = await supabase
    .from("cards")
    .insert({ customer_id: customerId, program_id: program.id, referred_by_card_id: referredBy, ...start })
    .select("id, web_token")
    .single();
  if (cardError || !card) return { error: "Création de la carte impossible. Réessaie dans un instant." };

  // Offre de bienvenue (valable 30 jours)
  if (program.welcome_offer) {
    await supabase.from("coupons").insert({
      card_id: card.id,
      program_id: program.id,
      title: program.welcome_offer,
      kind: "welcome",
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
  }

  // La carte Wallet est préparée pendant que le client découvre sa page : son clic « Ajouter » sera instantané
  const newCardId = card.id;
  const ua = (await headers()).get("user-agent") ?? "";
  const wallet = { apple: !/Android/i.test(ua), google: !/iPhone|iPad|iPod/i.test(ua) };
  after(() => warmCard(newCardId, wallet));
  redirect(`/carte/${card.web_token}`);
}
