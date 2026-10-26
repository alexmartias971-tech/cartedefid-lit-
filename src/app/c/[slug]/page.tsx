import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { programPitch } from "@/lib/card-state";
import { logoLook } from "@/lib/logo";
import { shopTheme } from "@/lib/shop-theme";
import { bannerSvgFor } from "@/lib/strip";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Program } from "@/lib/types";
import { registerCustomer } from "./actions";
import SignupView from "./SignupView";

type Shop = Pick<Business, "id" | "name" | "logo_url" | "status"> & { loyalty_programs: Program | null };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ p?: string }> };

/** Le commerce et son programme : UNE lecture par affichage, partagée par le titre, la barre du téléphone et la page. */
const loadShop = cache(async (slug: string): Promise<Shop | null> => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, name, logo_url, status, loyalty_programs(*)")
    .eq("slug", slug)
    .maybeSingle();
  return (data as unknown as Shop | null) ?? null;
});

/** Onglet et aperçu du lien partagé : « ADY COFFEE SHOP · Carte de fidélité ». */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const shop = await loadShop(slug);
  if (!shop) return { title: "Carte de fidélité" };
  const program = shop.loyalty_programs;
  return {
    title: `${shop.name} · Carte de fidélité`,
    description: program ? programPitch(program) : undefined,
  };
}

/** La barre du téléphone prend la couleur du commerce. */
export async function generateViewport({ params }: Pick<Props, "params">): Promise<Viewport> {
  const { slug } = await params;
  const shop = await loadShop(slug);
  return { themeColor: shopTheme(shop?.loyalty_programs).bg };
}

/** Attend au plus `ms` : la page ne reste jamais bloquée par une image lente (on fait sans). */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Page ouverte en scannant le QR code du comptoir. */
export default async function SignupPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p: referral } = await searchParams;
  const business = await loadShop(slug);
  if (!business) notFound();
  const program = business.loyalty_programs;

  const [strip, logo] = await Promise.all([
    // La bannière de la carte, telle que le client la recevra (avec le bonus d'inscription déjà rempli)
    program
      ? bannerSvgFor(
          program,
          business.logo_url,
          {
            total: program.mode === "stamps" ? program.reward_threshold : 10,
            filled: program.mode === "stamps" ? Math.min(program.signup_bonus, program.reward_threshold - 1) : 0,
          },
          "apple",
          1125,
          432,
        )
      : null,
    // Le logo a-t-il son propre fond ? Se voit-il sur la couleur du commerce ? (pour le présenter sans cadre inutile)
    within(logoLook(business.logo_url), 2500),
  ]);

  return (
    <SignupView
      business={business}
      program={program}
      strip={strip}
      logo={logo}
      referral={referral}
      action={registerCustomer.bind(null, slug)}
    />
  );
}
