import type { CSSProperties } from "react";
import CardPreview from "@/components/CardPreview";
import ShareButton from "@/components/ShareButton";
import { manrope } from "@/components/studio/fonts";
import WalletButtons from "@/components/WalletButtons";
import { computeCardState, describeProgram, designFromProgram, formatEuro, photoFor, resolveSlots, secondaryField, stripProgress } from "@/lib/card-state";
import { mascotSvg } from "@/lib/mascot";
import { inkOn, logoPresentation, logoSize, shopTheme, type LogoLook } from "@/lib/shop-theme";
import type { CardBundle, Program } from "@/lib/types";
// Base commune avec la page d'inscription (fond, feuille, bouton, pied de page), puis ce qui est propre à la carte
import "@/app/c/[slug]/signup.css";
import "./carte.css";
import EmailBonsPlans from "./EmailBonsPlans";
import MonNom from "./MonNom";

/** Le logo du commerce, présenté selon son image (fond propre, détouré…), sans cadre blanc inutile. */
function ShopLogo({ url, look, program, maxW, maxH }: { url: string; look: LogoLook | null; program: Program; maxW: number; maxH: number }) {
  const how = logoPresentation(look, program);
  const pad = how.mode === "tile" ? 0.78 : 1; // la pastille prend un peu de place autour
  const size = logoSize(look?.ratio, maxW * pad, maxH * pad);
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size.width}
      height={size.height}
      className="ws-logo-img"
      style={{ "--lw": size.width, "--lh": size.height } as CSSProperties}
    />
  );
  return (
    <span className={`ws-logo ws-logo-${how.mode}`} style={how.mode === "tile" ? { background: how.tile } : undefined}>
      {img}
    </span>
  );
}

type IconName = "check" | "gift" | "friend" | "star" | "camera" | "trophy" | "megaphone";

/** Petites icônes dessinées (nettes sur tous les téléphones, à la couleur du texte). */
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    check: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8.2 12.3 2.5 2.4 5.1-5.2" />
      </>
    ),
    gift: (
      <>
        <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
        <path d="M5 12.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8.5v12M12 8.5c-1.5-3.5-5.5-4-5.5-1.5 0 1.5 3 1.5 5.5 1.5Zm0 0c1.5-3.5 5.5-4 5.5-1.5 0 1.5-3 1.5-5.5 1.5Z" />
      </>
    ),
    friend: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.7c1.6.6 2.7 2.2 3 4.8" />
      </>
    ),
    star: <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8Z" />,
    camera: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="3.8" />
        <path d="M17 7v.1" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 4.5h8v5a4 4 0 0 1-8 0v-5ZM8 6.5H5a3 3 0 0 0 3 4M16 6.5h3a3 3 0 0 1-3 4M12 13.5v3.5M8.5 20h7M9.5 17h5" />
      </>
    ),
    megaphone: (
      <>
        <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1ZM16.5 9a4 4 0 0 1 0 6M8 15l1 4.5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="wk-icon"
    >
      {paths[name]}
    </svg>
  );
}

/**
 * L'affichage de la carte d'un client, aux couleurs du commerce (comme la page d'inscription), dans l'ordre où il en a besoin :
 *  1. son prénom + LE gros bouton Wallet de son téléphone (Apple sur iPhone, Google sur Android),
 *  2. sa carte (le design du commerce),
 *  3. le reste : carte web de secours, offres, niveaux, cadeaux, parrainage, avis, et « Mon prénom et mon nom » (corriger une faute).
 * Les couleurs viennent de la carte (lib/shop-theme.ts, contrastes vérifiés) : plus de thème Walty violet.
 */
export default function CardView({
  bundle,
  token,
  deja,
  isAndroid,
  inApp = null,
  sansWallet = false,
  emailAbonne = null,
  apple,
  google,
  giftQr,
  logo = null,
  shareBase,
}: {
  bundle: CardBundle;
  token: string;
  /** Le client avait déjà une carte (retrouvée à l'inscription). */
  deja: boolean;
  isAndroid: boolean;
  /** Page ouverte dans le navigateur d'une appli (Instagram, Facebook, TikTok…) : on aide à rouvrir dans Chrome ou Safari. */
  inApp?: "android" | "ios" | null;
  /** La carte n'est dans aucun téléphone (ni iPhone, ni Google) : on propose les bons plans par e-mail. */
  sansWallet?: boolean;
  /** Le client reçoit déjà les bons plans par e-mail : son adresse masquée (« al•••@gmail.com »). */
  emailAbonne?: string | null;
  /** Afficher le badge Apple Wallet / Google Wallet. */
  apple: boolean;
  google: boolean;
  /** QR code du cadeau (seulement quand le cadeau est prêt). */
  giftQr: string | null;
  /** Analyse du logo (fond propre ou détouré) ; null = inconnue, le logo est alors posé sur une pastille claire. */
  logo?: LogoLook | null;
  /** Adresse du site, pour le lien de parrainage. */
  shareBase: string;
}) {
  const { card, customer, program, business, tiers, catalog, coupons } = bundle;
  const state = computeCardState(program, card, tiers, catalog);
  const design = designFromProgram(program);
  const theme = shopTheme(program);
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
  const initial = business.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={`ws ${manrope.variable}`} style={theme.vars as CSSProperties}>
      {/* Le fond du téléphone (quand on tire l'écran) prend aussi la couleur du commerce */}
      <style>{`html,body{background-color:${theme.bg}}`}</style>
      <main className="ws-main wk-main">
        {/* Le commerce, en petit : c'est SA carte */}
        <div className="wk-top ws-rise">
          {business.logo_url ? (
            <ShopLogo url={business.logo_url} look={logo} program={program} maxW={120} maxH={48} />
          ) : (
            <span className="wk-top-dot" aria-hidden="true">
              {initial}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <p className="wk-top-name">{business.name}</p>
            <p className="wk-top-sub">Carte de fidélité</p>
          </div>
        </div>

        {deja && (
          <p className="wk-panel wk-hello ws-rise" role="status">
            <span className="wk-hello-icon">
              <Icon name="check" size={22} />
            </span>
            <span>
              Tu avais déjà une carte : la voici.
              <small>Re-bonjour {customer.first_name}, tout ce que tu as cumulé est bien là.</small>
            </span>
          </p>
        )}

        {state.rewardReady ? (
          // Le moment cadeau : plein écran à montrer en caisse
          <section className="wk-panel wk-gift ws-rise">
            {design.layout.layers.some((l) => l.kind === "mascot") ? (
              <svg
                viewBox="0 0 260 300"
                className="mx-auto h-28 w-auto"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: mascotSvg("stamp", 130, 150, 300, "gift") }}
              />
            ) : business.logo_url ? (
              <span className="wk-gift-puck">
                <ShopLogo url={business.logo_url} look={logo} program={program} maxW={200} maxH={80} />
              </span>
            ) : (
              <span className="wk-gift-icon" aria-hidden="true">
                <Icon name="gift" size={34} />
              </span>
            )}
            <h1 className="wk-gift-title">Ton cadeau t&apos;attend, {customer.first_name} !</h1>
            <p className="wk-gift-reward">
              {program.mode === "points" && state.affordable.length > 0 ? state.affordable[state.affordable.length - 1].name : program.reward_description}
            </p>
            <p className="wk-gift-hint">Montre ce QR code en caisse :</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={giftQr ?? ""} alt="QR code à présenter en caisse" className="wk-gift-qr" />
          </section>
        ) : (
          <div className="wk-intro ws-rise">
            <h1 className="wk-h1">
              {isNew ? (
                <>
                  Ta carte est prête,{" "}
                  <span className="wk-nowrap">
                    <span className="wk-mark">{customer.first_name}</span>&nbsp;!
                  </span>
                </>
              ) : (
                <>Ta carte {business.name}</>
              )}
            </h1>
            <p className="wk-sentence">{state.sentence}</p>
            {/* Juste après l'inscription (ou la carte retrouvée) : c'est là qu'on voit une faute dans son prénom */}
            {(isNew || deja) && <MonNom token={token} prenom={customer.first_name} nom={customer.last_name} variante="lien" />}
          </div>
        )}

        {/* LA grande action : l'ajouter au téléphone */}
        {wallet && (
          <section className="wk-panel wk-wallet ws-rise" style={{ "--d": "80ms" } as CSSProperties} aria-label="Ajouter la carte au téléphone">
            <p className="wk-wallet-title">{isNew ? "Garde-la dans ton téléphone en 1 touche" : "Ajoute-la à ton téléphone"}</p>
            <WalletButtons token={token} showApple={apple} showGoogle={google} inApp={inApp} base={shareBase} />
            <p className="wk-wallet-note">Gratuit, sans appli à télécharger. Elle se met à jour toute seule.</p>
          </section>
        )}

        <div className="wk-stage ws-rise" style={{ "--d": "140ms" } as CSSProperties}>
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
          <p className="wk-panel wk-msg">
            <Icon name="megaphone" size={20} />
            <span>{card.last_message}</span>
          </p>
        )}

        <section className="wk-panel">
          <h2 className="wk-h2">{wallet ? "Pas de Wallet ?" : "Ta carte est ici"}</h2>
          <ul className="wk-steps">
            <li>
              <span className="wk-steps-n">1</span>
              <span>
                <b>Ajoute cette page à tes favoris</b> (ou à ton écran d&apos;accueil) : c&apos;est aussi ta carte.
              </span>
            </li>
            <li>
              <span className="wk-steps-n">2</span>
              <span>
                En caisse, <b>montre le QR code</b> de ta carte ci-dessus.
              </span>
            </li>
          </ul>
        </section>

        {coupons.length > 0 && (
          <section className="wk-panel">
            <h2 className="wk-h2 wk-h2-icon">
              <Icon name="gift" size={20} />
              Tes offres
            </h2>
            <p className="wk-muted wk-small" style={{ marginTop: -6 }}>
              À montrer en caisse.
            </p>
            <ul className="wk-list">
              {coupons.map((c) => (
                <li key={c.id} className="wk-ticket">
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
          <section className="wk-panel">
            {state.tier && (
              <div className="wk-tier">
                <span
                  className="wk-tier-dot"
                  style={state.tier.color ? { background: state.tier.color, color: inkOn(state.tier.color) } : undefined}
                  aria-hidden="true"
                >
                  <Icon name="star" size={20} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 800 }}>
                    Niveau {state.tier.name}
                    {state.tier.perk ? ` : ${state.tier.perk}` : ""}
                  </p>
                  {state.nextTier && (
                    <p className="wk-muted wk-small">
                      Prochain niveau ({state.nextTier.tier.name}) dans {state.nextTier.remaining}.
                    </p>
                  )}
                </div>
              </div>
            )}
            {program.mode === "points" && catalog.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                <h2 className="wk-h2">Cadeaux</h2>
                <ul className="wk-list">
                  {catalog
                    .filter((r) => r.is_active)
                    .map((r) => (
                      <li key={r.id} className={`wk-reward ${r.cost <= card.points_balance ? "wk-reward-ok" : ""}`}>
                        <span>{r.name}</span>
                        <b>{r.cost} pts</b>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <p className="wk-muted wk-small">{state.rule}</p>
            {program.mode === "cashback" && Number(card.cashback_balance) > 0 && (
              <p style={{ fontWeight: 700 }}>Cagnotte disponible : {formatEuro(card.cashback_balance)}</p>
            )}
          </section>
        )}

        {program.lap_times_enabled && (
          <a href={`/classement/${business.slug}`} className="ws-btn">
            <Icon name="trophy" size={20} />
            Voir le classement{state.rank ? ` (tu es P${state.rank.pos})` : ""}
          </a>
        )}

        {(program.referral_bonus > 0 || business.google_review_url || business.instagram_url) && (
          <section className="wk-panel" style={{ textAlign: "center" }}>
            {program.referral_bonus > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                <h2 className="wk-h2 wk-h2-icon" style={{ justifyContent: "center" }}>
                  <Icon name="friend" size={20} />
                  Parraine un ami
                </h2>
                <p className="wk-muted wk-small">
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
              <a href={business.google_review_url} target="_blank" rel="noopener" className="wk-btn-ghost">
                <Icon name="star" size={19} />
                Donner mon avis sur Google
              </a>
            )}
            {business.instagram_url && (
              <a href={business.instagram_url} target="_blank" rel="noopener" className="wk-btn-ghost">
                <Icon name="camera" size={19} />
                Suivre sur Instagram
              </a>
            )}
          </section>
        )}

        {sansWallet && <EmailBonsPlans token={token} commerce={business.name} abonne={emailAbonne} />}

        <MonNom token={token} prenom={customer.first_name} nom={customer.last_name} variante="panneau" />

        <details className="wk-panel wk-details">
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

        <footer className="ws-foot">
          <a href="/confidentialite">Confidentialité et suppression de tes données</a>
          <a href="https://walty.fr" target="_blank" rel="noopener" className="ws-by">
            Carte proposée par <b>Walty</b>
          </a>
        </footer>
      </main>
    </div>
  );
}
