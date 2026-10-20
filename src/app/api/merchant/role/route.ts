import { NextResponse } from "next/server";
import { getMerchantRole } from "@/lib/merchant-role";
import { getWaltyPlan } from "@/lib/walty-plan";

/**
 * Qui est connecté, et avec quels droits ? (espace commerçant de walty.fr)
 * - role « gerant » : connecté par e-mail/identifiant + mot de passe, mot de passe provisoire changé ;
 * - role « employe » : connecté par lien d'accès + code PIN (ou ancienne session sans la preuve « gérant »).
 * La passerelle de walty.fr s'en sert pour refuser à un employé Mon programme, Offres, Messages, etc.
 * plan : formule Walty du commerce (« essentiel » ou « tout-compris »). Ne renvoie aucun identifiant.
 */
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const role = await getMerchantRole();
  if (!role) return NextResponse.json({ ok: false, error: "Session expirée : reconnectez-vous." }, { status: 401, headers: NO_STORE });
  const { plan } = await getWaltyPlan(role.session.businessId);
  return NextResponse.json(
    {
      ok: true,
      role: role.manager ? "gerant" : "employe",
      password: role.password,
      mustChangePassword: role.mustChange,
      canNotify: role.session.canSendNotifications,
      label: role.session.label,
      plan,
    },
    { headers: NO_STORE },
  );
}
