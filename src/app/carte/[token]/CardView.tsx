import CardPreview from "@/components/CardPreview";
import ClientShell from "@/components/client/ClientShell";
import ShareButton from "@/components/ShareButton";
import WalletButtons from "@/components/WalletButtons";
import { computeCardState, describeProgram, designFromProgram, formatEuro, photoFor, resolveSlots, secondaryField, stripProgress } from "@/lib/card-state";
import { mascotSvg } from "@/lib/mascot";
import type { CardBundle } from "@/lib/types";

/**
 * L'affichage de la carte d'un client, dans l'ordre où il en a besoin :
 *  1. son prénom + LE gros bouton Wallet de son téléphone (Apple sur iPhone, Google sur Android),
 *  2. sa carte (le design du commerce),
 *  3. le reste : carte web de secours, offres, niveaux, cadeaux, parrainage, avis.
 */
export default function CardView({
  bundle,
  token,
  deja,
  isAndroid,
  apple,
  google,
  giftQr,
  shareBase,
}: {
  bundle: CardBundle;
  token: string;
  /** Le client avait déjà une carte (retrouvée à l'inscription). */
  deja: boolean;
  isAndroid: boolean;
  /** Afficher le badge Apple Wallet / Google Wallet. */
  apple: boolean;
  google: boolean;
  /** QR code du cadeau (seulement quand le cadeau est prêt). */
  giftQr: string | null;
  /** Adresse du site, pour le lien de parrainage. */
  shareBase: string;
}) {
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
  const wallet = apple || google;
  const isNew = card.lifetime_visits === 0;

  return (
    <ClientShell>
      {/* Le commerce, en petit : c'est SA carte */}
      <div className="wc-top wc-in">
        {business.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logo_url} alt="" className="wc-top-logo" />
        ) : (
          <span className="wc-top-dot" style={{ background: program.background_color, color: program.foreground_color }} aria-hidden="true">
            {business.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <p className="wc-top-name">{business.name}</p>
          <p className="wc-top-sub">Carte de fidélité</p>
        </div>
      </div>

      {deja && (
        <p className="wc-hello" role="status">
          <span className="wc-hello-wave" aria-hidden="true">👋</span>
          <span>
            Tu avais déjà une carte : la voici.
            <small>Re-bonjour {customer.first_name}, tout ce que tu as cumulé est bien là.</small>
          </span>
        </p>
      )}

      {state.rewardReady ? (
        // Le moment cadeau : plein écran à montrer en caisse
        <section className="wc-gift" style={{ background: program.background_color, color: program.foreground_color }}>
          {design.layout.layers.some((l) => l.kind === "mascot") ? (
            <svg viewBox="0 0 260 300" className="mx-auto h-28 w-auto" aria-hidden="true" dangerouslySetInnerHTML={{ __html: mascotSvg("stamp", 130, 150, 300, "gift") }} />
          ) : business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt="" className="mx-auto h-20 max-w-[200px] object-contain" />
          ) : (
            <div className="text-6xl" aria-hidden="true">🎁</div>
          )}
          <h1 className="wc-display wc-h1">Ton cadeau t&apos;attend, {customer.first_name} !</h1>
          <p style={{ fontSize: 18, fontWeight: 700 }}>
            {program.mode === "points" && state.affordable.length > 0 ? state.affordable[state.affordable.length - 1].name : program.reward_description}
          </p>
          <p style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>Montre ce QR code en caisse :</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={giftQr ?? ""} alt="QR code à présenter en caisse" className="wc-gift-qr" />
        </section>
      ) : (
        <div className="wc-intro wc-in">
          <h1 className="wc-display wc-h1">
            {isNew ? (
              <>
                Ta carte est prête,{" "}
                <span className="wc-nowrap">
                  <span className="wc-grad-text">{customer.first_name}</span>&nbsp;!
                </span>
              </>
            ) : (
              <>Ta carte {business.name}</>
            )}
          </h1>
          <p className="wc-sentence">{state.sentence}</p>
        </div>
      )}

      {/* LA grande action : l'ajouter au téléphone */}
      {wallet && (
        <section className="wc-panel wc-panel-glow wc-wallet wc-in wc-in-2" aria-label="Ajouter la carte au téléphone">
          <p className="wc-wallet-title">{isNew ? "Garde-la dans ton téléphone en 1 touche" : "Ajoute-la à ton téléphone"}</p>
          <WalletButtons token={token} showApple={apple} showGoogle={google} />
          <p className="wc-wallet-note">Gratuit, sans appli à télécharger. Elle se met à jour toute seule.</p>
        </section>
      )}

      <div className="wc-stage">
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

      {card.last_message && (
        <p className="wc-msg">
          <span aria-hidden="true">📣</span>
          <span>{card.last_message}</span>
        </p>
      )}

      <section className="wc-panel">
        <h2 className="wc-h2">{wallet ? "Pas de Wallet ?" : "Ta carte est ici"}</h2>
        <ul className="wc-steps">
          <li>
            <span className="wc-steps-n">1</span>
            <span>
              <b>Ajoute cette page à tes favoris</b> (ou à ton écran d&apos;accueil) : c&apos;est aussi ta carte.
            </span>
          </li>
          <li>
            <span className="wc-steps-n">2</span>
            <span>
              En caisse, <b>montre le QR code</b> de ta carte ci-dessus.
            </span>
          </li>
        </ul>
      </section>

      {coupons.length > 0 && (
        <section className="wc-panel">
          <h2 className="wc-h2">🎁 Tes offres</h2>
          <p className="wc-muted wc-small" style={{ marginTop: -6 }}>
            À montrer en caisse.
          </p>
          <ul className="wc-list">
            {coupons.map((c) => (
              <li key={c.id} className="wc-ticket">
                {c.title}
                {c.expires_at && (
                  <small>Jusqu&apos;au {new Date(c.expires_at).toLocaleDateString("fr-FR", { timeZone: "America/Guadeloupe" })}</small>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(state.tier || (program.mode === "points" && catalog.length > 0)) && (
        <section className="wc-panel">
          {state.tier && (
            <div className="wc-tier">
              <span className="wc-tier-dot" style={state.tier.color ? { background: state.tier.color } : undefined} aria-hidden="true">
                ⭐
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 800 }}>
                  Niveau {state.tier.name}
                  {state.tier.perk ? ` : ${state.tier.perk}` : ""}
                </p>
                {state.nextTier && (
                  <p className="wc-muted wc-small">
                    Prochain niveau ({state.nextTier.tier.name}) dans {state.nextTier.remaining}.
                  </p>
                )}
              </div>
            </div>
          )}
          {program.mode === "points" && catalog.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <h2 className="wc-h2">Cadeaux</h2>
              <ul className="wc-list">
                {catalog
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <li key={r.id} className={`wc-reward ${r.cost <= card.points_balance ? "wc-reward-ok" : ""}`}>
                      <span>{r.name}</span>
                      <b>{r.cost} pts</b>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <p className="wc-faint wc-small">{state.rule}</p>
          {program.mode === "cashback" && Number(card.cashback_balance) > 0 && (
            <p style={{ fontWeight: 700 }}>Cagnotte disponible : {formatEuro(card.cashback_balance)}</p>
          )}
        </section>
      )}

      {program.lap_times_enabled && (
        <a href={`/classement/${business.slug}`} className="wc-btn wc-btn-primary">
          🏆 Voir le classement{state.rank ? ` (tu es P${state.rank.pos})` : ""}
        </a>
      )}

      {(program.referral_bonus > 0 || business.google_review_url || business.instagram_url) && (
        <section className="wc-panel" style={{ textAlign: "center" }}>
          {program.referral_bonus > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <h2 className="wc-h2">🤝 Parraine un ami</h2>
              <p className="wc-muted wc-small">
                À sa première visite, tu gagnes {program.referral_bonus}{" "}
                {program.mode === "points" ? "points" : `tampon${program.referral_bonus > 1 ? "s" : ""}`} en plus.
              </p>
              <ShareButton
                url={`${shareBase}/c/${business.slug}?p=${card.referral_code}`}
                text={`Je te conseille ${business.name} ! Prends ta carte de fidélité ici :`}
              />
            </div>
          )}
          {business.google_review_url && (
            <a href={business.google_review_url} target="_blank" rel="noopener" className="wc-btn wc-btn-ghost">
              ⭐ Donner mon avis sur Google
            </a>
          )}
          {business.instagram_url && (
            <a href={business.instagram_url} target="_blank" rel="noopener" className="wc-btn wc-btn-ghost">
              📸 Suivre sur Instagram
            </a>
          )}
        </section>
      )}

      <details className="wc-panel wc-details">
        <summary>Comment ça marche ?</summary>
        <ul>
          {describeProgram(program, tiers).map((r) => (
            <li key={r.title}>
              <span aria-hidden="true">{r.icon}</span>
              <span>
                <b>{r.title} :</b> {r.text}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </ClientShell>
  );
}
