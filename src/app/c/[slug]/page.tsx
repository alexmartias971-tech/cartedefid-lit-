import { notFound } from "next/navigation";
import { cardBannerSvg, designFromProgram, programPitch } from "@/lib/card-state";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Program } from "@/lib/types";
import { registerCustomer } from "./actions";
import SignupForm from "./SignupForm";

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
    ? cardBannerSvg(
        designFromProgram(program),
        {
          total: program.mode === "stamps" ? program.reward_threshold : 10,
          filled: program.mode === "stamps" ? Math.min(program.signup_bonus, program.reward_threshold - 1) : 0,
        },
        "google",
        1032,
        336,
        "signup",
      )
    : null;

  return (
    <main className="flex-1 w-full max-w-md mx-auto p-4 space-y-5">
      <header
        className="rounded-3xl overflow-hidden text-center"
        style={{ background: program?.background_color ?? "#0B6474", color: program?.foreground_color ?? "#fff" }}
      >
        {strip && (
          <div className="w-full [&>svg]:w-full [&>svg]:h-full" style={{ aspectRatio: "1032 / 336" }} dangerouslySetInnerHTML={{ __html: strip }} />
        )}
        <div className="p-6 pt-4">
        {business.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logo_url} alt="" className="mx-auto h-16 w-16 object-contain rounded-xl bg-white p-1" />
        )}
        <h1 className="text-2xl font-bold mt-3">{business.name}</h1>
        {program && (
          <p className="mt-1">
            <strong>{programPitch(program)}</strong>
          </p>
        )}
        {program && program.signup_bonus > 0 && program.mode !== "cashback" && (
          <p className="mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold" style={{ background: program.stamp_color, color: program.background_color }}>
            🎁 {program.signup_bonus} {program.mode === "stamps" ? `tampon${program.signup_bonus > 1 ? "s" : ""}` : "points"} offert{program.signup_bonus > 1 ? "s" : ""} à l&apos;inscription
          </p>
        )}
        {referral && <p className="mt-2 text-sm opacity-90">Un ami t&apos;a invité 🤝</p>}
        </div>
      </header>

      {business.status !== "active" || !program?.is_active ? (
        <p className="alert-error">Ce programme de fidélité n&apos;est pas disponible pour le moment.</p>
      ) : (
        <div className="panel">
          <SignupForm
            action={registerCustomer.bind(null, slug)}
            businessName={business.name}
            referral={referral && /^[0-9A-Fa-f]{8}$/.test(referral) ? referral.toUpperCase() : null}
            leaderboard={program.lap_times_enabled}
          />
        </div>
      )}
    </main>
  );
}
