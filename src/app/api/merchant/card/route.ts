import QRCode from "qrcode";
import sharp from "sharp";
import { computeCardState, describeProgram, designFromProgram, fieldLabels } from "@/lib/card-state";
import { appUrl } from "@/lib/env";
import { getMerchantSession } from "@/lib/merchant-session";
import { expired, json, pitchVous } from "@/lib/merchant-space";
import { renderStripFor } from "@/lib/strip";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, CatalogReward, Program, Tier } from "@/lib/types";

export const maxDuration = 30;

/** Le logo en petite image intégrée (data:), pour fabriquer l'affiche en PNG dans le navigateur. */
async function logoData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(320, 320, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * « Ma carte » dans l'espace commerçant de walty.fr :
 * l'aperçu de la carte telle que la voient les clients, le lien d'inscription et son QR code (affiche du comptoir).
 * Seulement pour le commerce de la session ; aucune donnée client.
 */
export async function GET() {
  const session = await getMerchantSession();
  if (!session) return expired();
  const supabase = createAdminClient();

  const [{ data: biz }, { data: programData }] = await Promise.all([
    supabase.from("businesses").select("*").eq("id", session.businessId).single(),
    supabase.from("loyalty_programs").select("*, program_tiers(*), reward_catalog(*)").eq("business_id", session.businessId).maybeSingle(),
  ]);
  if (!biz) return json({ ok: false, error: "Commerce introuvable." }, 404);
  const business = biz as Business;
  const signupUrl = `${appUrl()}/c/${business.slug}`;

  const [qrPng, logo] = await Promise.all([
    QRCode.toDataURL(signupUrl, { width: 1024, margin: 2, errorCorrectionLevel: "M" }),
    logoData(business.logo_url),
  ]);

  let card = null;
  let rules: { icon: string; title: string; text: string }[] = [];
  let wallets = { apple: 0, google: 0, web: 0, none: 0 };
  if (programData) {
    const { program_tiers: tiers = [], reward_catalog: catalog = [], ...rest } = programData as Program & {
      program_tiers?: Tier[];
      reward_catalog?: CatalogReward[];
    };
    const program = rest as Program;
    const sortedTiers = [...tiers].sort((a, b) => Number(a.min_value) - Number(b.min_value));
    const sortedCatalog = [...catalog].sort((a, b) => a.cost - b.cost);
    // Un client « exemple » à mi-parcours, pour l'aperçu
    const threshold = program.reward_threshold || 10;
    const filled = Math.max(1, Math.min(threshold - 1, Math.round(threshold * 0.4)));
    const firstCost = sortedCatalog.find((r) => r.is_active)?.cost ?? 100;
    const sample = {
      stamps_count: program.mode === "stamps" ? filled : 0,
      points_balance: program.mode === "points" ? Math.round(firstCost * 0.6) : 0,
      cashback_balance: program.mode === "cashback" ? 4.5 : 0,
      lifetime_visits: filled,
      lifetime_spent: 0,
      tier_id: null,
    };
    const state = computeCardState(program, sample, sortedTiers, sortedCatalog);
    const design = designFromProgram(program);
    const labels = fieldLabels(design, state);
    const progress =
      program.mode === "stamps" && state.stamps
        ? state.stamps
        : program.mode === "points"
          ? { total: 10, filled: 6 }
          : { total: 10, filled: 0 };
    let strip: string | null = null;
    try {
      const png = await renderStripFor(program, progress, 2, "apple", null, business.logo_url);
      strip = `data:image/png;base64,${png.toString("base64")}`;
    } catch (err) {
      console.error("[espace card strip]", (err as Error).message);
    }
    card = {
      programName: program.name,
      mode: program.mode,
      isActive: program.is_active,
      colors: { background: program.background_color, foreground: program.foreground_color, label: program.label_color },
      showLogoText: program.show_logo_text ?? true,
      labels: { balance: labels.balance, customer: labels.customer, reward: labels.reward ?? (program.mode === "stamps" ? "CADEAU" : null) },
      sample: { name: "Marie", balanceValue: state.balanceValue, sentence: state.sentence, stamps: state.stamps },
      reward: program.mode === "stamps" ? program.reward_description : program.mode === "cashback" ? `${Number(program.cashback_percent)} % en cagnotte` : sortedCatalog[0]?.name ?? null,
      strip,
      pitch: pitchVous(program),
      welcome: program.welcome_offer,
    };
    rules = describeProgram(program, sortedTiers);
    const count = (platform: string | null) => {
      const q = supabase.from("cards").select("id", { count: "exact", head: true }).eq("program_id", program.id);
      return Promise.resolve(platform ? q.eq("wallet_platform", platform) : q.is("wallet_platform", null)).then((r) => r.count ?? 0);
    };
    const [apple, google, web, none] = await Promise.all([count("apple"), count("google"), count("web"), count(null)]);
    wallets = { apple, google, web, none };
  }

  return json({
    ok: true,
    business: { name: business.name, logo_url: business.logo_url, logo_data: logo, address: business.address, phone: business.phone },
    signupUrl,
    qrPng,
    card,
    rules,
    wallets,
  });
}
