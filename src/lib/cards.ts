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
  if (!data) return null;
  const [bundle] = await withRankTotals([toBundle(data as Row)]);
  return bundle;
}

/** Ajoute le nombre de pilotes classés (pour afficher « P3 / 48 »). */
async function withRankTotals(bundles: CardBundle[]): Promise<CardBundle[]> {
  const programs = [...new Set(bundles.filter((b) => b.program.lap_times_enabled).map((b) => b.program.id))];
  if (programs.length === 0) return bundles;
  const supabase = createAdminClient();
  const totals = new Map<string, number>();
  for (const id of programs) {
    const { count } = await supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("program_id", id)
      .not("best_lap_ms", "is", null);
    totals.set(id, count ?? 0);
  }
  return bundles.map((b) => (totals.has(b.program.id) ? { ...b, card: { ...b.card, lap_rank_total: totals.get(b.program.id) } } : b));
}

/** Charge plusieurs cartes d'un coup (pour les notifications). */
export async function loadCardBundlesByIds(ids: string[]): Promise<CardBundle[]> {
  if (ids.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("cards").select(SELECT).in("id", ids);
  if (error) throw new Error(error.message);
  return withRankTotals((data as Row[]).map(toBundle));
}
