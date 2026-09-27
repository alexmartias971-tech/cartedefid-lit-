import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business, Program } from "@/lib/types";
import { registerCustomer } from "./actions";
import SignupForm from "./SignupForm";

/** Page ouverte en scannant le QR code du comptoir. */
export default async function SignupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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

  return (
    <main className="flex-1 w-full max-w-md mx-auto p-4 space-y-5">
      <header
        className="rounded-3xl p-6 text-center"
        style={{ background: program?.background_color ?? "#0B6474", color: program?.foreground_color ?? "#fff" }}
      >
        {business.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logo_url} alt="" className="mx-auto h-16 w-16 object-contain rounded-xl bg-white p-1" />
        )}
        <h1 className="text-2xl font-bold mt-3">{business.name}</h1>
        {program && (
          <p className="mt-1">
            {program.reward_threshold} passages = <strong>{program.reward_description}</strong>
          </p>
        )}
      </header>

      {business.status !== "active" || !program?.is_active ? (
        <p className="alert-error">Ce programme de fidélité n&apos;est pas disponible pour le moment.</p>
      ) : (
        <div className="panel">
          <SignupForm action={registerCustomer.bind(null, slug)} businessName={business.name} />
        </div>
      )}
    </main>
  );
}
