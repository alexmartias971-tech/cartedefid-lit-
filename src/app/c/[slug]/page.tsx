import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { bannerSvgFor } from "@/lib/strip";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Program } from "@/lib/types";
import { registerCustomer } from "./actions";
import SignupView from "./SignupView";

export const metadata = { title: "Ma carte de fidélité" };
// Barre du téléphone couleur « nuit Walty »
export const viewport: Viewport = { themeColor: "#110c18" };

/** Page ouverte en scannant le QR code du comptoir. */
export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { slug } = await params;
  const { p: referral } = await searchParams;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, name, logo_url, status, loyalty_programs(*)")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) notFound();
  const business = data as unknown as Pick<Business, "id" | "name" | "logo_url" | "status"> & {
    loyalty_programs: Program | null;
  };
  const program = business.loyalty_programs;
  // La bannière de la carte, telle que le client la recevra (avec le bonus d'inscription déjà rempli)
  const strip = program
    ? await bannerSvgFor(
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
    : null;

  return (
    <SignupView
      business={business}
      program={program}
      strip={strip}
      referral={referral}
      action={registerCustomer.bind(null, slug)}
    />
  );
}
