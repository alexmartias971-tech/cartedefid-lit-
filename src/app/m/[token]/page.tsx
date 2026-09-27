import { notFound } from "next/navigation";
import { getMerchantSession } from "@/lib/merchant-session";
import { createAdminClient } from "@/lib/supabase/admin";
import MerchantApp from "./MerchantApp";
import PinForm from "./PinForm";

export const metadata = { title: "Espace commerçant" };

/** Espace du commerçant : code PIN, puis Scanner / Notifications / Clients. */
export default async function MerchantPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) notFound();

  const supabase = createAdminClient();
  const { data: access } = await supabase
    .from("scanner_access")
    .select("id, label, businesses(name, logo_url)")
    .eq("access_token", token)
    .maybeSingle();
  if (!access) notFound();
  const business = access.businesses as unknown as { name: string; logo_url: string | null };

  const session = await getMerchantSession();
  if (!session || session.accessToken !== token) {
    return <PinForm token={token} businessName={business.name} logoUrl={business.logo_url} />;
  }

  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("reward_threshold, reward_description")
    .eq("business_id", session.businessId)
    .single();

  return (
    <MerchantApp
      businessName={business.name}
      accessLabel={session.label}
      canNotify={session.canSendNotifications}
      threshold={program?.reward_threshold ?? 10}
      reward={program?.reward_description ?? ""}
    />
  );
}
