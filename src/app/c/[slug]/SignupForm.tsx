"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { SignupState } from "./actions";

/** La coche des cases (dessinée, pour une grosse case facile au doigt). */
function Box() {
  return (
    <span className="ws-box" aria-hidden="true">
      <svg viewBox="0 0 16 16">
        <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * Inscription en 20 secondes : prénom + téléphone (ou e-mail). Le nom n'est demandé que pour le classement.
 */
export default function SignupForm({
  action,
  businessName,
  referral,
  leaderboard,
}: {
  action: (prev: SignupState, fd: FormData) => Promise<SignupState>;
  businessName: string;
  referral?: string | null;
  leaderboard?: boolean;
}) {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(action, {});
  const [byEmail, setByEmail] = useState(false);
  // Champs « contrôlés » : rien n'est effacé si l'inscription renvoie une erreur
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [board, setBoard] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  // Quand une erreur arrive, on la fait défiler à l'écran pour qu'elle soit vue
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);

  return (
    <form
      action={formAction}
      className="ws-form"
      onSubmit={(e) => {
        // Envoi « à la main » : React ne vide pas le formulaire (ni les cases cochées) si une erreur revient
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {referral && <input type="hidden" name="ref" value={referral} />}
      {/* Champ piège anti-robots, invisible pour les humains */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="site_web">Ne pas remplir</label>
        <input id="site_web" name="site_web" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="ws-field">
        <label htmlFor="first_name" className="ws-label">
          Ton prénom
        </label>
        <input
          id="first_name"
          name="first_name"
          required
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="next"
          className="ws-input"
          placeholder="Ex. : Léa"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </div>

      {leaderboard && (
        <div className="ws-field">
          <label htmlFor="last_name" className="ws-label">
            Ton nom <small>(pour le classement)</small>
          </label>
          <input
            id="last_name"
            name="last_name"
            autoComplete="family-name"
            autoCapitalize="words"
            className="ws-input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      )}

      {!byEmail ? (
        <div className="ws-field">
          <label htmlFor="phone" className="ws-label">
            Ton téléphone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            autoComplete="tel"
            className="ws-input"
            placeholder="0690 00 00 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button type="button" className="ws-switch" onClick={() => setByEmail(true)}>
            Je préfère donner mon e-mail
          </button>
        </div>
      ) : (
        <div className="ws-field">
          <label htmlFor="email" className="ws-label">
            Ton e-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            required
            autoComplete="email"
            autoCapitalize="off"
            className="ws-input"
            placeholder="lea@exemple.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="button" className="ws-switch" onClick={() => setByEmail(false)}>
            Je préfère donner mon téléphone
          </button>
        </div>
      )}

      <div className="ws-checks">
        <label className="ws-check">
          <input type="checkbox" name="marketing" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <Box />
          <span>
            Je veux recevoir les bons plans de {businessName} sur ma carte. Je peux arrêter à tout moment.
          </span>
        </label>
        {leaderboard && (
          <label className="ws-check">
            <input type="checkbox" name="leaderboard" checked={board} onChange={(e) => setBoard(e.target.checked)} />
            <Box />
            <span>
              🏆 J&apos;accepte d&apos;apparaître au classement public des meilleurs temps (prénom + initiale du nom). Sinon, je
              suis affiché « Pilote anonyme ».
            </span>
          </label>
        )}
        <label className="ws-check ws-check-required">
          <input type="checkbox" name="privacy" required checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
          <Box />
          <span>
            J&apos;ai lu{" "}
            <a href="/confidentialite" target="_blank">
              comment mes données sont utilisées
            </a>{" "}
            <span className="ws-req">(obligatoire)</span>
          </span>
        </label>
      </div>

      {state.error && (
        <p ref={errorRef} className="ws-alert ws-alert-error" role="alert">
          <svg className="ws-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.4v.1" />
          </svg>
          <span>{state.error}</span>
        </p>
      )}

      <button type="submit" disabled={pending} className="ws-btn">
        {pending ? (
          <>
            <span className="ws-spin" aria-hidden="true" /> Création de ta carte…
          </>
        ) : (
          <>
            Recevoir ma carte
            <svg className="ws-btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
            </svg>
          </>
        )}
      </button>
      <p className="ws-note">
        Ta carte s&apos;ajoute à Apple Wallet ou Google Wallet. Rien à télécharger.
      </p>
    </form>
  );
}
