import ClientShell from "@/components/client/ClientShell";
import { programPitch } from "@/lib/card-state";
import type { Business, Program } from "@/lib/types";
import type { SignupState } from "./actions";
import SignupForm from "./SignupForm";

/**
 * L'écran d'inscription (ce que voit le client après avoir scanné le QR code du comptoir).
 * En haut : la carte du commerce (sa bannière, son logo, son nom). En dessous : le formulaire court.
 */
export default function SignupView({
  business,
  program,
  strip,
  referral,
  action,
}: {
  business: Pick<Business, "name" | "logo_url" | "status">;
  program: Program | null;
  strip: string | null;
  referral?: string | null;
  action: (prev: SignupState, fd: FormData) => Promise<SignupState>;
}) {
  const open = business.status === "active" && !!program?.is_active;
  const bg = program?.background_color ?? "#1e1430";
  const fg = program?.foreground_color ?? "#ffffff";
  const bonus = program && program.signup_bonus > 0 && program.mode !== "cashback" ? program.signup_bonus : 0;

  return (
    <ClientShell>
      <header className="wc-shop wc-in" style={{ background: bg, color: fg }}>
        {strip ? (
          <div className="wc-shop-strip" dangerouslySetInnerHTML={{ __html: strip }} />
        ) : (
          <div className="wc-shop-strip" style={{ aspectRatio: "375 / 90" }} aria-hidden="true" />
        )}
        <div className="wc-shop-body">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt="" className="wc-shop-logo" />
          ) : (
            <span className="wc-shop-nologo" aria-hidden="true" />
          )}
          <h1 className="wc-shop-name">{business.name}</h1>
          {program && <p className="wc-shop-pitch">{programPitch(program)}</p>}
          {(bonus > 0 || referral) && (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 4 }}>
              {bonus > 0 && program && (
                <span className="wc-chip" style={{ background: program.stamp_color, color: program.background_color }}>
                  🎁 {bonus} {program.mode === "stamps" ? `tampon${bonus > 1 ? "s" : ""}` : "points"} offert{bonus > 1 ? "s" : ""} à l&apos;inscription
                </span>
              )}
              {referral && <span className="wc-chip wc-chip-soft">🤝 Un ami t&apos;a invité</span>}
            </div>
          )}
        </div>
      </header>

      {!open || !program ? (
        <p className="wc-alert wc-alert-off" role="status">
          <span className="wc-alert-icon" aria-hidden="true">⏸️</span>
          <span>Ce programme de fidélité n&apos;est pas disponible pour le moment. Demande en caisse.</span>
        </p>
      ) : (
        <section className="wc-panel wc-in wc-in-2" aria-labelledby="wc-form-title">
          <div style={{ display: "grid", gap: 4 }}>
            <span className="wc-kicker">Gratuit · sans appli</span>
            <h2 id="wc-form-title" className="wc-display" style={{ fontSize: 22 }}>
              Ta carte en 10 secondes
            </h2>
          </div>
          <SignupForm
            action={action}
            businessName={business.name}
            referral={referral && /^[0-9A-Fa-f]{8}$/.test(referral) ? referral.toUpperCase() : null}
            leaderboard={program.lap_times_enabled}
            birthday={!!program.birthday_offer}
          />
        </section>
      )}
    </ClientShell>
  );
}
