import { requireAdmin } from "@/lib/admin-auth";

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export de tous les clients d'une entreprise en CSV (s'ouvre dans Excel). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { supabase } = await requireAdmin();
  const { data: business } = await supabase.from("businesses").select("slug").eq("id", id).maybeSingle();
  const { data } = await supabase
    .from("customers")
    .select(
      "first_name, last_name, email, phone, birth_date, marketing_optin, created_at, last_visit_at, cards(stamps_count, points_balance, cashback_balance, lifetime_visits, lifetime_spent, rewards_redeemed, wallet_platform)",
    )
    .eq("business_id", id)
    .order("created_at");

  type Row = {
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    birth_date: string | null;
    marketing_optin: boolean;
    created_at: string;
    last_visit_at: string | null;
    cards: {
      stamps_count: number;
      points_balance: number;
      cashback_balance: number;
      lifetime_visits: number;
      lifetime_spent: number;
      rewards_redeemed: number;
      wallet_platform: string | null;
    }[];
  };
  const header = [
    "Prénom",
    "Nom",
    "Email",
    "Téléphone",
    "Naissance",
    "Accepte les offres",
    "Inscrit le",
    "Dernière visite",
    "Tampons",
    "Points",
    "Cagnotte (€)",
    "Passages",
    "Total dépensé (€)",
    "Cadeaux remis",
    "Wallet",
  ];
  const lines = ((data ?? []) as Row[]).map((c) =>
    [
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      // Depuis l'inscription simplifiée, l'année n'est plus demandée (enregistrée en 2000) : on n'affiche que jour/mois
      c.birth_date ? (c.birth_date.startsWith("2000-") ? `${c.birth_date.slice(8, 10)}/${c.birth_date.slice(5, 7)}` : c.birth_date) : null,
      c.marketing_optin ? "oui" : "non",
      c.created_at,
      c.last_visit_at,
      c.cards?.[0]?.stamps_count ?? 0,
      c.cards?.[0]?.points_balance ?? 0,
      String(c.cards?.[0]?.cashback_balance ?? 0).replace(".", ","),
      c.cards?.[0]?.lifetime_visits ?? 0,
      String(c.cards?.[0]?.lifetime_spent ?? 0).replace(".", ","),
      c.cards?.[0]?.rewards_redeemed ?? 0,
      c.cards?.[0]?.wallet_platform ?? "",
    ]
      .map(csvCell)
      .join(";"),
  );
  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients-${business?.slug ?? id}.csv"`,
    },
  });
}
