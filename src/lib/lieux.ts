import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, CardBundle } from "@/lib/types";

/**
 * Plusieurs emplacements par commerce pour la notification « à moins de 100 m » (6 nov. 2026, demande d'Alexandre : IFC a deux
 * roulottes). Les emplacements sont posés sur une carte, dans le CRM ou par le commerçant avec son lien, et gardés dans le réglage du
 * CRM du commerce (table crm_reglages, clé « auto:<business_id> », la même ligne que « Tu nous manques » et l'avis Google) :
 *   { "lieux": [{ "n": "Roulotte 1", "a": 16.2411, "o": -61.5331 }, …] }
 * La notification reste allumée ou coupée par la position du commerce (businesses.latitude / longitude, = le 1er emplacement) :
 * position vide = aucun lieu sur la carte, même si la liste existe. Pas de liste = la position du commerce seule (comme avant).
 * Apple et Google acceptent 10 lieux par carte au plus.
 */
export type Lieu = { latitude: number; longitude: number };
type AvecLieux = Business & { lieux?: Lieu[] };
const MAX = 10;

/** La liste lue dans le réglage (valeur JSON) ; illisible ou absente : liste vide. */
export function lireLieux(valeur: string | null | undefined): Lieu[] {
  try {
    const v = JSON.parse(valeur ?? "{}") as { lieux?: unknown } | null;
    if (!v || !Array.isArray(v.lieux)) return [];
    const out: Lieu[] = [];
    for (const x of v.lieux as { a?: unknown; o?: unknown }[]) {
      const a = Number(x?.a), o = Number(x?.o);
      if (Number.isFinite(a) && Number.isFinite(o) && Math.abs(a) <= 90 && Math.abs(o) <= 180) out.push({ latitude: a, longitude: o });
      if (out.length >= MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

// 5 secondes de mémoire (une mise à jour de toutes les cartes d'un commerce ne relit la liste qu'une fois)
const memoire = new Map<string, { t: number; lieux: Lieu[] }>();
const enCours = new Map<string, Promise<Lieu[]>>();

/** La liste du commerce ; base injoignable : liste vide (la carte garde alors la position du commerce seule). */
export async function lieuxDuCommerce(businessId: string): Promise<Lieu[]> {
  const m = memoire.get(businessId);
  if (m && Date.now() - m.t < 5000) return m.lieux;
  const deja = enCours.get(businessId);
  if (deja) return deja;
  const p = (async () => {
    try {
      const { data, error } = await createAdminClient().from("crm_reglages").select("valeur").eq("cle", `auto:${businessId}`).maybeSingle();
      if (error) throw new Error(error.message);
      const lieux = lireLieux((data as { valeur?: string | null } | null)?.valeur);
      memoire.set(businessId, { t: Date.now(), lieux });
      return lieux;
    } catch (e) {
      console.error("[lieux]", (e as Error).message);
      return [];
    } finally {
      enCours.delete(businessId);
    }
  })();
  enCours.set(businessId, p);
  return p;
}

/** Les lieux à mettre sur la carte (Apple « locations », Google « merchantLocations »). */
export function lieuxDe(business: Business): Lieu[] {
  if (business.latitude == null || business.longitude == null) return [];
  const liste = (business as AvecLieux).lieux;
  if (liste && liste.length) return liste.slice(0, MAX);
  return [{ latitude: Number(business.latitude), longitude: Number(business.longitude) }];
}

/** Le commerce avec sa liste d'emplacements (lue une fois). */
export async function avecLieuxCommerce(business: Business): Promise<Business> {
  if ((business as AvecLieux).lieux !== undefined || business.latitude == null || business.longitude == null) return business;
  const lieux = await lieuxDuCommerce(business.id);
  return { ...business, lieux } as AvecLieux;
}

/** La carte d'un client avec les emplacements de son commerce. */
export async function avecLieux(bundle: CardBundle): Promise<CardBundle> {
  const business = await avecLieuxCommerce(bundle.business);
  return business === bundle.business ? bundle : { ...bundle, business };
}
