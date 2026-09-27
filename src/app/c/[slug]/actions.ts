"use server";

import { redirect } from "next/navigation";
import { normalizePhone } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export type SignupState = { error?: string };
const POLICY_VERSION = "v1";

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

  if (!firstName) return { error: "Indique ton prénom." };
  if (!email && !phone) return { error: "Indique ton email ou ton téléphone." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "L'email ne semble pas valide." };
  if (phone && phone.replace(/\D/g, "").length < 9) return { error: "Le téléphone ne semble pas valide." };
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { error: "Date de naissance invalide." };
  if (!privacy) return { error: "Tu dois accepter la politique de confidentialité pour créer ta carte." };

  const supabase = createAdminClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, status, loyalty_programs(id, is_active)")
    .eq("slug", slug)
    .maybeSingle();
  const program = (business?.loyalty_programs as unknown as { id: string; is_active: boolean } | null) ?? null;
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
  const existingCard = existing?.cards?.[0];
  if (existingCard) redirect(`/carte/${existingCard.web_token}?deja=1`);

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

  const { data: card, error: cardError } = await supabase
    .from("cards")
    .insert({ customer_id: customerId, program_id: program.id })
    .select("web_token")
    .single();
  if (cardError || !card) return { error: "Création de la carte impossible. Réessaie dans un instant." };

  redirect(`/carte/${card.web_token}`);
}
