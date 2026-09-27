import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import PrintButton from "@/components/PrintButton";
import { requireAdmin } from "@/lib/admin-auth";
import { appUrl } from "@/lib/env";
import type { Business, Program } from "@/lib/types";

/** Kit de lancement : l'affiche à poser sur le comptoir + la fiche du commerçant. */
export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: b } = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
  if (!b) notFound();
  const business = b as Business;
  const { data: p } = await supabase.from("loyalty_programs").select("*").eq("business_id", id).maybeSingle();
  const program = p as Program | null;
  const { data: accesses } = await supabase
    .from("scanner_access")
    .select("label, access_token")
    .eq("business_id", id)
    .eq("is_active", true);

  const signupUrl = `${appUrl()}/c/${business.slug}`;
  const signupQr = await QRCode.toDataURL(signupUrl, { width: 600, margin: 1 });
  const accessQrs = await Promise.all(
    (accesses ?? []).map(async (a: { label: string; access_token: string }) => ({
      label: a.label,
      url: `${appUrl()}/m/${a.access_token}`,
      qr: await QRCode.toDataURL(`${appUrl()}/m/${a.access_token}`, { width: 300, margin: 1 }),
    })),
  );
  const bg = program?.background_color ?? "#0B6474";
  const fg = program?.foreground_color ?? "#FFFFFF";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/admin/entreprises/${id}`} className="underline text-gray-600">
          ← Retour
        </Link>
        <PrintButton />
      </div>
      <p className="text-sm text-gray-600 print:hidden">
        Dans la fenêtre d&apos;impression, choisis « Enregistrer au format PDF » pour obtenir un fichier, et coche «
        Graphiques d&apos;arrière-plan » pour garder les couleurs.
      </p>

      {/* AFFICHE COMPTOIR */}
      <section
        className="mx-auto max-w-[560px] rounded-3xl p-8 text-center shadow-lg break-after-page"
        style={{ background: bg, color: fg, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      >
        {business.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logo_url} alt="" className="mx-auto h-20 w-20 object-contain rounded-xl bg-white p-1" />
        )}
        <h1 className="text-3xl font-extrabold mt-4">{business.name}</h1>
        <p className="text-xl mt-2">Ta carte de fidélité dans ton téléphone</p>
        {program && (
          <p className="text-lg font-semibold mt-4">
            {program.reward_threshold} passages = {program.reward_description} 🎁
          </p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signupQr} alt="QR code d'inscription" className="mx-auto mt-6 w-64 h-64 rounded-2xl bg-white p-3" />
        <ol className="mt-6 text-left mx-auto max-w-xs space-y-1 text-lg">
          <li>1. Scanne ce QR code avec l&apos;appareil photo</li>
          <li>2. Indique ton prénom</li>
          <li>3. Ajoute la carte à ton Wallet</li>
        </ol>
        <p className="mt-4 text-sm opacity-80">Gratuit · Aucune application à installer · iPhone et Android</p>
      </section>

      {/* FICHE COMMERÇANT */}
      <section className="mx-auto max-w-[560px] panel space-y-4">
        <h2 className="text-2xl font-bold">Fiche commerçant : {business.name}</h2>
        {accessQrs.length === 0 ? (
          <p className="alert-error">Aucun accès commerçant actif. Crée-en un dans la fiche de l&apos;entreprise.</p>
        ) : (
          accessQrs.map((a) => (
            <div key={a.url} className="flex gap-4 items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.qr} alt="" className="w-32 h-32" />
              <div className="text-sm break-all">
                <div className="font-semibold text-base">{a.label}</div>
                {a.url}
                <div className="mt-1">Code PIN : ________</div>
              </div>
            </div>
          ))
        )}
        <ol className="list-decimal pl-5 space-y-1 text-sm">
          <li>Scanne le QR ci-dessus avec ton téléphone et tape ton code PIN.</li>
          <li>
            Ajoute la page à ton écran d&apos;accueil (Safari : Partager → « Sur l&apos;écran d&apos;accueil » ; Chrome
            : ⋮ → « Ajouter à l&apos;écran d&apos;accueil »).
          </li>
          <li>
            À chaque passage : bouton « Scanner », vise le QR code dans le Wallet du client, puis « Ajouter 1 tampon ».
          </li>
          <li>Quand le cadeau est débloqué : remets le cadeau, puis « Valider le cadeau ».</li>
          <li>Notifications : 2 maximum par semaine, uniquement aux clients qui ont accepté.</li>
        </ol>
      </section>
    </div>
  );
}
