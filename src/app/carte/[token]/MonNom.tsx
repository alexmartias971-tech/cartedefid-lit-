"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { corrigerNom, type NomState } from "./actions";

/**
 * Corriger son prénom ou son nom (une faute de frappe à l'inscription : « Alecandre »).
 *  - « lien » : sous le titre, juste après l'inscription (c'est là qu'on voit la faute) : un petit lien qui ouvre le formulaire ;
 *  - « panneau » : toujours disponible en bas de la page, replié (« Mon prénom et mon nom »).
 */
export default function MonNom({
  token,
  prenom,
  nom,
  variante,
}: {
  token: string;
  prenom: string;
  nom: string | null;
  variante: "lien" | "panneau";
}) {
  const [state, formAction, pending] = useActionState<NomState, FormData>(corrigerNom, {});
  const [ouvert, setOuvert] = useState(false);
  // Champs « contrôlés » : rien n'est effacé si une erreur revient
  const [first, setFirst] = useState(prenom);
  const [last, setLast] = useState(nom ?? "");
  const prenomRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ouvert) prenomRef.current?.focus();
  }, [ouvert]);

  const fait = state.ok && (
    <p className="ws-alert ws-alert-found wk-nom-fait" role="status">
      <svg className="ws-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.3l2.7 2.7L16 9.6" />
      </svg>
      <span>
        C&apos;est corrigé. Nom sur ta carte : <b>{state.prenom} {state.nom}</b>. Si elle est dans ton Wallet, elle se met à jour
        toute seule dans quelques instants.
      </span>
    </p>
  );

  const formulaire = (
    <form
      action={formAction}
      className="ws-form wk-nom-form"
      onSubmit={(e) => {
        // Envoi « à la main » : React ne vide pas le formulaire si une erreur revient
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="token" value={token} />
      <div className="ws-row2">
        <div className="ws-field">
          <label htmlFor={`nf-${variante}`} className="ws-label">
            Ton prénom
          </label>
          <input
            ref={prenomRef}
            id={`nf-${variante}`}
            name="first_name"
            required
            maxLength={60}
            autoComplete="given-name"
            autoCapitalize="words"
            className="ws-input"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </div>
        <div className="ws-field">
          <label htmlFor={`nl-${variante}`} className="ws-label">
            Ton nom
          </label>
          <input
            id={`nl-${variante}`}
            name="last_name"
            required
            maxLength={60}
            autoComplete="family-name"
            autoCapitalize="words"
            className="ws-input"
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />
        </div>
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
          "Enregistrer"
        )}
      </button>
    </form>
  );

  if (variante === "lien") {
    return (
      <>
        {!ouvert && !state.ok && (
          <button type="button" className="wk-nom-lien" onClick={() => setOuvert(true)}>
            Pas le bon prénom ? <span className="wk-nowrap">Corrige-le</span>
          </button>
        )}
        {ouvert && !state.ok && (
          <section className="wk-panel" aria-label="Corriger mon prénom et mon nom">
            <h2 className="wk-h2">Ton prénom et ton nom</h2>
            {formulaire}
            <button type="button" className="ws-switch" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </section>
        )}
        {fait}
      </>
    );
  }

  return (
    <details className="wk-panel wk-details" open={ouvert} onToggle={(e) => setOuvert((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Mon prénom et mon nom</summary>
      <p className="wk-muted wk-small">
        Nom sur ta carte :{" "}
        <b className="wk-nom-actuel">
          {state.ok ? `${state.prenom} ${state.nom}` : `${prenom}${nom ? ` ${nom}` : ""}`}
        </b>
        . Une faute ? Corrige-la ici : ta carte et ton Wallet se mettent à jour.
      </p>
      {fait}
      {formulaire}
    </details>
  );
}
