import type { CSSProperties } from "react";
import { manrope } from "@/components/studio/fonts";
import { programPitch } from "@/lib/card-state";
import { logoPresentation, shopTheme, type LogoLook } from "@/lib/shop-theme";
import type { Business, Program } from "@/lib/types";
import type { SignupState } from "./actions";
import SignupForm from "./SignupForm";
import "./signup.css";

/** Taille d'affichage du logo selon son format (jamais déformé, jamais trop large). */
function logoSize(ratio: number | undefined, framed: boolean) {
  const r = ratio && Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const maxH = framed ? 76 : 92;
  const maxW = framed ? 200 : 220;
  const h = Math.min(maxH, maxW / r);
  return { width: Math.round(h * r), height: Math.round(h) };
}

/** Le logo du commerce, présenté selon son image (voir logoPresentation). */
function ShopLogo({ url, look, program }: { url: string; look: LogoLook | null; program: Program | null }) {
  const how = logoPresentation(look, program);
  const framed = how.mode === "tile";
  const size = logoSize(look?.ratio, framed);
  // Image décorative : le nom du commerce est écrit juste en dessous (titre de la page)
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
  if (how.mode === "tile") {
    return (
      <span className="ws-logo ws-logo-tile" style={{ background: how.tile }}>
        {img}
      </span>
    );
  }
  return <span className={`ws-logo ws-logo-${how.mode}`}>{img}</span>;
}

/** Petites icônes dessinées (nettes sur tous les téléphones, à la couleur du texte). */
function Icon({ name }: { name: "stamp" | "gift" | "friend" | "pause" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "gift")
    return (
      <svg {...common}>
        <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
        <path d="M5 12.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8.5v12M12 8.5c-1.5-3.5-5.5-4-5.5-1.5 0 1.5 3 1.5 5.5 1.5Zm0 0c1.5-3.5 5.5-4 5.5-1.5 0 1.5-3 1.5-5.5 1.5Z" />
      </svg>
    );
  if (name === "friend")
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.7c1.6.6 2.7 2.2 3 4.8" />
      </svg>
    );
  if (name === "pause")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 9v6M14 9v6" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.3 2.5 2.4 5.1-5.2" />
    </svg>
  );
}

/**
 * L'écran d'inscription (ce que voit le client après avoir scanné le QR code du comptoir), aux couleurs du commerce :
 * en haut son logo, son nom et la récompense ; puis la vraie bannière de sa carte, posée sur une feuille claire
 * qui contient le formulaire court. Toutes les couleurs viennent de la carte (lib/shop-theme.ts, contrastes vérifiés).
 */
export default function SignupView({
  business,
  program,
  strip,
  logo = null,
  referral,
  action,
}: {
  business: Pick<Business, "name" | "logo_url" | "status">;
  program: Program | null;
  strip: string | null;
  /** Analyse du logo (fond propre ou détouré) ; null = inconnue, le logo est alors posé sur une pastille claire. */
  logo?: LogoLook | null;
  referral?: string | null;
  action: (prev: SignupState, fd: FormData) => Promise<SignupState>;
}) {
  const open = business.status === "active" && !!program?.is_active;
  const theme = shopTheme(program);
  const bonus = program && program.signup_bonus > 0 && program.mode !== "cashback" ? program.signup_bonus : 0;
  // La récompense seule (l'offre de bienvenue est montrée à part, en pastille)
  const reward = program ? programPitch({ ...program, welcome_offer: null }) : null;
  const initial = business.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={`ws ${manrope.variable}`} style={theme.vars as CSSProperties}>
      {/* Le fond du téléphone (quand on tire l'écran) prend aussi la couleur du commerce */}
      <style>{`html,body{background-color:${theme.bg}}`}</style>
      <main className="ws-main">
        <header className="ws-hero">
          <div className="ws-rise">
            {business.logo_url ? (
              <ShopLogo url={business.logo_url} look={logo} program={program} />
            ) : (
              <span className="ws-monogram" aria-hidden="true">
                {initial}
              </span>
            )}
          </div>
          <h1 className="ws-name ws-rise" style={{ "--d": "60ms" } as CSSProperties}>
            {business.name}
          </h1>
          {reward && (
            <p className="ws-reward ws-rise" style={{ "--d": "110ms" } as CSSProperties}>
              <span className="ws-reward-icon">
                <Icon name="stamp" />
              </span>
              <span>{reward}</span>
            </p>
          )}
          {(bonus > 0 || referral || program?.welcome_offer) && (
            // Le premier cadeau ressort (couleurs inversées), les autres pastilles restent discrètes
            <ul className="ws-chips ws-rise" style={{ "--d": "150ms" } as CSSProperties}>
              {program?.welcome_offer && (
                <li className="ws-chip ws-chip-strong">
                  <Icon name="gift" />
                  Bienvenue : {program.welcome_offer}
                </li>
              )}
              {bonus > 0 && program && (
                <li className={`ws-chip ${program.welcome_offer ? "ws-chip-soft" : "ws-chip-strong"}`}>
                  <Icon name="gift" />
                  {`${bonus} ${program.mode === "stamps" ? `tampon${bonus > 1 ? "s" : ""}` : "points"} offert${bonus > 1 ? "s" : ""} à l'inscription`}
                </li>
              )}
              {referral && (
                <li className="ws-chip ws-chip-soft">
                  <Icon name="friend" />
                  Un ami t&apos;a invité
                </li>
              )}
            </ul>
          )}
        </header>

        <div className="ws-stack">
          {/* La vraie bannière de la carte (dessinée par le moteur des cartes), posée sur la feuille */}
          {strip ? (
            <div
              className="ws-card ws-rise"
              style={{ "--d": "190ms" } as CSSProperties}
              role="img"
              aria-label={`Aperçu de ta carte ${business.name}`}
              dangerouslySetInnerHTML={{ __html: strip }}
            />
          ) : (
            <div className="ws-card ws-card-empty ws-rise" aria-hidden="true" />
          )}

          {!open || !program ? (
            <section className="ws-sheet ws-rise" style={{ "--d": "240ms" } as CSSProperties}>
              <p className="ws-alert ws-alert-off" role="status">
                <Icon name="pause" />
                <span>Ce programme de fidélité n&apos;est pas disponible pour le moment. Demande en caisse.</span>
              </p>
            </section>
          ) : (
            <section className="ws-sheet ws-rise" style={{ "--d": "240ms" } as CSSProperties} aria-labelledby="ws-form-title">
              <div className="ws-sheet-head">
                <p className="ws-kicker">Gratuit · sans appli</p>
                <h2 id="ws-form-title" className="ws-title">
                  Ta carte en 10 secondes
                </h2>
              </div>
              <SignupForm
                action={action}
                businessName={business.name}
                referral={referral && /^[0-9A-Fa-f]{8}$/.test(referral) ? referral.toUpperCase() : null}
                leaderboard={program.lap_times_enabled}
              />
            </section>
          )}
        </div>

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
