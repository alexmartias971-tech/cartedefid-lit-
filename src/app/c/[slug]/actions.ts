"use server";

import { redirect } from "next/navigation";
import { normalizePhone } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export type SignupState = { error?: string };
const POLICY_VERSION = "v2"; // v2 (4 oct. 2026) : textes des cases et page confidentialité complétée

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
  const birthDate = String(fd.get("birth_date") ?? "") || null;
  const privacy = fd.get("privacy") === "on";
  const marketing = fd.get("marketing") === "on";
  const leaderboard = fd.get("leaderboard") === "on";

  if (!firstName) return { error: "Indique ton prénom." };
  if (!email && !phone) return { error: "Indique ton email ou ton téléphone." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "L'email ne semble pas valide." };
  if (phone && phone.replace(/\D/g, "").length < 9) return { error: "Le téléphone ne semble pas valide." };
  if (birthDate) {
    // La date doit exister (pas de 31 février)
    const d = new Date(`${birthDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== birthDate) {
      return { error: "Cette date d'anniversaire n'existe pas : vérifie le jour et le mois." };
    }
  }
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
  type Existing = { id: string; cards: { web_token: string }[] };
  let existing = null as Existing | null;
  for (const [column, value] of [
    ["email", email],
    ["phone", phone],
  ] as const) {
    if (existing || !value) continue;
    const { data } = await supabase
      .from("customers")
      .select("id, cards(web_token)")
      .eq("business_id", business.id)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    existing = (data as Existing | null) ?? null;
  }
  // Déjà une carte : on ne l'ouvre PAS ici (sinon, avec le numéro d'un autre client, on verrait sa carte et son QR code)
  const existingCard = existing?.cards?.[0];
  if (existingCard) {
    return {
      error:
        "Tu as déjà une carte avec ce numéro (ou cet e-mail) : retrouve-la dans ton Wallet (app Cartes sur iPhone, Google Wallet sur Android). Tu ne la trouves plus ? Demande en caisse, on t'aide.",
    };
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
        birth_date: birthDate,
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

  redirect(`/carte/${card.web_token}`);
}
