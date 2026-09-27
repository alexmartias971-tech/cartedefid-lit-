import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Card, CardBundle, Customer, Program } from "@/lib/types";

const SELECT = "*, customers(*), loyalty_programs(*, businesses(*))";

type Row = Card & {
  customers: Customer;
  loyalty_programs: Program & { businesses: Business };
};

function toBundle(row: Row): CardBundle {
  const { customers, loyalty_programs, ...card } = row;
  const { businesses, ...program } = loyalty_programs;
  return { card, customer: customers, program, business: businesses };
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
