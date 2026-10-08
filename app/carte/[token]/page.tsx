import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CardPreview from "@/components/CardPreview";
import WalletButtons from "@/components/WalletButtons";
import { loadCardBundle } from "@/lib/cards";
import { isAppleConfigured, isGoogleConfigured } from "@/lib/env";
import { computeCardState, describeProgram, designFromProgram, formatEuro, photoFor, resolveSlots, secondaryField, stripProgress } from "@/lib/card-state";
import { appUrl } from "@/lib/env";
import ShareButton from "@/components/ShareButton";
import QRCode from "qrcode";
import { mascotSvg } from "@/lib/mascot";

export const metadata = { title: "Ma carte de fidélité" };

/**
 * La page de la carte d'un client. Elle propose le bon bouton Wallet selon le téléphone,
 * et sert aussi de carte web de secours (à mettre en favori) pour les téléphones sans Wallet.
 */
export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ deja?: string }>;
}) {
  const { token } = await params;
  const { deja } = await searchParams;
  const bundle = await loadCardBundle("web_token", token);
  if (!bundle) notFound();
  const { card, customer, program, business, tiers, catalog, coupons } = bundle;
  const state = computeCardState(program, card, tiers, catalog);
  const design = designFromProgram(program);
  // Zones choisies dans l'éditeur visuel (null = affichage automatique)
  const nextReward =
    program.mode === "points"
      ? ([...catalog].filter((r) => r.is_active).sort((a, b) => a.cost - b.cost).find((r) => r.cost > card.points_balance) ?? null)
      : null;
  const slots = resolveSlots(design, state, {
    customerName: customer.first_name,
    mode: program.mode,
    rewardDescription: program.reward_description,
    cashbackPercent: Number(program.cashback_percent),
    nextReward: nextReward ? { cost: nextReward.cost, name: nextReward.name } : null,
    coupons: coupons.length,
  });

  const giftQr = state.rewardReady ? await QRCode.toDataURL(card.serial_number, { width: 360, margin: 1 }) : null;
  const ua = (await headers()).get("user-agent") ?? "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const apple = isAppleConfigured() && !isAndroid;
  const google = isGoogleConfigured() && !isIOS;

  return (
    <main className="flex-1 w-full max-w-md mx-auto p-4 space-y-5">
      {state.rewardReady ? (
        // Le moment cadeau : plein écran à montrer en caisse
        <section className="rounded-3xl p-6 text-center shadow-lg" style={{ background: program.background_color, color: program.foreground_color }}>
          {design.layout.layers.some((l) => l.kind === "mascot") ? (
            <svg viewBox="0 0 260 300" className="mx-auto h-28 w-auto" aria-hidden="true" dangerouslySetInnerHTML={{ __html: mascotSvg("stamp", 130, 150, 300, "gift") }} />
          ) : business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt="" className="mx-auto h-20 max-w-[200px] object-contain" />
          ) : (
            <div className="text-6xl" aria-hidden="true">🎁</div>
          )}
          <h1 className="mt-2 text-3xl font-black">Ton cadeau t&apos;attend, {customer.first_name} !</h1>
          <p className="mt-2 text-lg font-semibold">
            {program.mode === "points" && state.affordable.length > 0 ? state.affordable[state.affordable.length - 1].name : program.reward_description}
          </p>
          <p className="mt-3 text-sm opacity-90">Montre ce QR code en caisse :</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={giftQr ?? ""} alt="QR code à présenter en caisse" className="mx-auto mt-2 h-48 w-48 rounded-xl bg-white p-2" />
        </section>
      ) : (
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">
            {card.lifetime_visits > 0 ? `Ta carte ${business.name}` : `Ta carte ${business.name} est prête, ${customer.first_name} !`}
          </h1>
          <p className="text-gray-700">{state.sentence}</p>
        </div>
      )}
      {deja && <p className="alert-ok text-center">Tu avais déjà une carte : la voici.</p>}

      {(apple || google) && (
        <div className="panel space-y-3 text-center">
          <p className="font-semibold">Ajoute-la à ton téléphone :</p>
          <WalletButtons token={token} showApple={apple} showGoogle={google} />
        </div>
      )}

      <div className="flex justify-center">
        <CardPreview
          platform={isAndroid ? "google" : "poster"}
          photoUrl={photoFor(program, state.tier, isAndroid ? "google" : "poster")}
          businessName={business.name}
          logoUrl={business.logo_url}
          customerName={customer.first_name}
          design={state.tier?.image_url ? { ...design, layout: { ...design.layout, crop: undefined } } : design}
          state={state}
          slots={slots}
          secondary={secondaryField(program, card, catalog)}
          couponsCount={coupons.length}
          progress={stripProgress(program.mode, state, card, catalog)}
          qrValue={card.serial_number}
        />
      </div>

      <div className="panel text-center space-y-2">
        <p className="font-semibold">Pas de Wallet ?</p>
        <p className="text-sm text-gray-600">
          Ajoute cette page à tes favoris : c&apos;est aussi ta carte. Montre son QR code en caisse.
        </p>
        {card.last_message && <p className="text-sm bg-gray-50 rounded-lg p-2">📣 {card.last_message}</p>}
      </div>

      {coupons.length > 0 && (
        <div className="panel space-y-2">
          <p className="font-semibold">🎁 Tes offres (à montrer en caisse)</p>
          <ul className="space-y-1 text-sm">
            {coupons.map((c) => (
              <li key={c.id} className="rounded-lg bg-gray-50 p-2">
                {c.title}
                {c.expires_at && (
                  <span className="block text-xs text-gray-500">
                    Jusqu&apos;au {new Date(c.expires_at).toLocaleDateString("fr-FR", { timeZone: "America/Guadeloupe" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(state.tier || (program.mode === "points" && catalog.length > 0)) && (
        <div className="panel space-y-3 text-sm">
          {state.tier && (
            <div>
              <p className="font-semibold">
                Niveau {state.tier.name}
                {state.tier.perk ? ` : ${state.tier.perk}` : ""}
              </p>
              {state.nextTier && (
                <p className="text-gray-600">
                  Prochain niveau ({state.nextTier.tier.name}) dans {state.nextTier.remaining}.
                </p>
              )}
            </div>
          )}
          {program.mode === "points" && catalog.length > 0 && (
            <div>
              <p className="font-semibold">Cadeaux</p>
              <ul>
                {catalog
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <li key={r.id} className={r.cost <= card.points_balance ? "font-semibold text-green-700" : ""}>
                      {r.cost} pts : {r.name}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <p className="text-gray-500">{state.rule}</p>
          {program.mode === "cashback" && Number(card.cashback_balance) > 0 && (
            <p>Cagnotte disponible : {formatEuro(card.cashback_balance)}</p>
          )}
        </div>
      )}

      <details className="panel">
        <summary className="font-semibold cursor-pointer">❓ Comment ça marche</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {describeProgram(program, tiers).map((r) => (
            <li key={r.title} className="flex gap-2">
              <span>{r.icon}</span>
              <span><b>{r.title} :</b> {r.text}</span>
            </li>
          ))}
        </ul>
      </details>

      {program.lap_times_enabled && (
        <a href={`/classement/${business.slug}`} className="btn btn-primary w-full">
          🏆 Voir le classement{state.rank ? ` (tu es P${state.rank.pos})` : ""}
        </a>
      )}

      {(program.referral_bonus > 0 || business.google_review_url || business.instagram_url) && (
        <div className="panel space-y-3 text-center">
          {program.referral_bonus > 0 && (
            <div className="space-y-2">
              <p className="font-semibold">🤝 Parraine un ami</p>
              <p className="text-sm text-gray-600">
                À sa première visite, tu gagnes {program.referral_bonus}{" "}
                {program.mode === "points" ? "points" : `tampon${program.referral_bonus > 1 ? "s" : ""}`} en plus.
              </p>
              <ShareButton
                url={`${appUrl()}/c/${business.slug}?p=${card.referral_code}`}
                text={`Je te conseille ${business.name} ! Prends ta carte de fidélité ici :`}
              />
            </div>
          )}
          {business.google_review_url && (
            <a href={business.google_review_url} target="_blank" rel="noopener" className="btn btn-secondary w-full">
              ⭐ Donner mon avis sur Google
            </a>
          )}
          {business.instagram_url && (
            <a href={business.instagram_url} target="_blank" rel="noopener" className="btn btn-secondary w-full">
              📸 Suivre sur Instagram
            </a>
          )}
        </div>
      )}

      <p className="text-center text-xs text-gray-500">
        <a href="/confidentialite" className="underline">
          Confidentialité et suppression de tes données
        </a>
      </p>
    </main>
  );
}
