"use client";

import { startTransition, useActionState, useState } from "react";
import { recevoirEmails, type EmailState } from "./actions";

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
 * Pour le client qui n'a pas la carte dans son téléphone (ni Apple Wallet, ni Google Wallet) : il ne reçoit aucune
 * notification. Ici, il peut laisser son e-mail pour recevoir les bons plans du commerce (relance sans Wallet, lib/email.ts).
 * Déjà inscrit aux e-mails : une ligne le lui rappelle, avec son adresse masquée (`abonne`, masquée par le serveur).
 */
export default function EmailBonsPlans({ token, commerce, abonne }: { token: string; commerce: string; abonne: string | null }) {
  const [state, formAction, pending] = useActionState<EmailState, FormData>(recevoirEmails, {});
  const [email, setEmail] = useState("");
  const [accord, setAccord] = useState(false);

  if (state.ok || abonne) {
    return (
      <p className="wk-panel wk-small wk-muted" role="status">
        📧 Tu reçois les bons plans de {commerce} par e-mail ({state.ok ? masquer(state.email ?? "") : abonne}). Pour arrêter : lien en bas
        de chaque e-mail.
      </p>
    );
  }

  return (
    <details className="wk-panel wk-details">
      <summary>Pas de carte dans ton téléphone ? Reçois les bons plans par e-mail</summary>
      <p className="wk-muted wk-small">
        Sans Apple Wallet ni Google Wallet, tu ne reçois pas les notifications de {commerce}. Laisse ton e-mail : les bons plans
        arrivent dans ta boîte.
      </p>
      <form
        action={formAction}
        className="ws-form"
        onSubmit={(e) => {
          // Envoi « à la main » : React ne vide pas le formulaire si une erreur revient
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
      >
        <input type="hidden" name="token" value={token} />
        <div className="ws-field">
          <label htmlFor="eb-email" className="ws-label">
            Ton e-mail
          </label>
          <input
            id="eb-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            placeholder="prenom@gmail.com"
            className="ws-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="ws-checks">
          <label className="ws-check ws-check-required">
            <input type="checkbox" name="accord" required checked={accord} onChange={(e) => setAccord(e.target.checked)} />
            <Box />
            <span>
              J&apos;accepte de recevoir les bons plans de {commerce} par e-mail et sur ma carte. Je peux arrêter à tout moment.
            </span>
          </label>
        </div>
        {state.error && (
          <p className="ws-alert ws-alert-error" role="alert">
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
              <span className="ws-spin" aria-hidden="true" /> Enregistrement…
            </>
          ) : (
            "Recevoir les bons plans par e-mail"
          )}
        </button>
      </form>
    </details>
  );
}

/** « alexandre@gmail.com » → « al•••@gmail.com » (l'adresse ne s'affiche jamais en entier sur la page). */
function masquer(email: string): string {
  const [nom, domaine] = email.split("@");
  if (!domaine) return "";
  return `${nom.slice(0, 2)}•••@${domaine}`;
}
