import "server-only";
import { activeCoupons } from "@/lib/card-state";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Card, CardBundle, CatalogReward, Coupon, Customer, Program, Tier } from "@/lib/types";

const SELECT =
  "*, customers(*), coupons(*), loyalty_programs(*, businesses(*), program_tiers(*), reward_catalog(*))";

type Row = Card & {
  customers: Customer;
  coupons: Coupon[];
  loyalty_programs: Program & { businesses: Business; program_tiers: Tier[]; reward_catalog: CatalogReward[] };
};

function toBundle(row: Row): CardBundle {
  const { customers, loyalty_programs, coupons, ...card } = row;
  const { businesses, program_tiers, reward_catalog, ...program } = loyalty_programs;
  return {
    card,
    customer: customers,
    program,
    business: businesses,
    tiers: [...(program_tiers ?? [])].sort((a, b) => Number(a.min_value) - Number(b.min_value)),
    catalog: [...(reward_catalog ?? [])].sort((a, b) => a.cost - b.cost),
    coupons: activeCoupons(coupons ?? []),
  };
}

/** Charge une carte complète en cherchant par une colonne (id, serial_number, web_token). */
export async function loadCardBundle(
  column: "id" | "serial_number" | "web_token",
  value: string,
): Promise<CardBundle | null> {
  // Un identifiant mal formé ne doit pas provoquer d'erreur de base de données
  if (column !== "web_token" && !/^[0-9a-f-]{36}$/i.test(value)) return null;
  if (column === "web_token" && !/^[0-9a-f]{32}$/i.test(value)) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("cards").select(SELECT).eq(column, value).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toBundle(data as Row) : null;
}

/** Charge plusieurs cartes d'un coup (pour les notifications). */
export async function loadCardBundlesByIds(ids: string[]): Promise<CardBundle[]> {
  if (ids.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("cards").select(SELECT).in("id", ids);
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toBundle);
}
