"use client";

import { useActionState, type CSSProperties } from "react";
import { ouvrirCarte, type OuvrirState } from "./actions";
import "@/app/c/[slug]/signup.css";
import "./carte.css";

/** Lien ouvert sur un autre téléphone : aucune donnée du client n'est envoyée au navigateur tant que le contact n'est pas confirmé. */
export default function CarteProtegee({
  token,
  commerce,
  slug,
  fontClass,
  vars,
  bg,
}: {
  token: string;
  commerce: string;
  slug: string;
  fontClass: string;
  vars: CSSProperties;
  bg: string;
}) {
  const [state, action, pending] = useActionState<OuvrirState, FormData>(ouvrirCarte, {});
  return (
    <div className={`ws ${fontClass}`} style={vars}>
      <style>{`html,body{background-color:${bg}}`}</style>
      <main className="ws-main wk-main">
        <section className="wk-panel ws-rise">
          <h1 className="wk-h2">Cette carte {commerce} est protégée</h1>
          <p className="wk-muted">C&apos;est ta carte ? Entre le numéro ou l&apos;e-mail donné à l&apos;inscription.</p>
          <form action={action} className="ws-form">
            <input type="hidden" name="token" value={token} />
            <div className="ws-field">
              <label htmlFor="contact" className="ws-label">
                Ton numéro ou ton e-mail
              </label>
              <input id="contact" name="contact" required maxLength={120} autoComplete="off" autoCapitalize="off" className="ws-input" />
            </div>
            {state.error && (
              <p className="ws-alert ws-alert-error" role="alert">
                <span>{state.error}</span>
              </p>
            )}
            <button type="submit" disabled={pending} className="ws-btn">
              {pending ? "Vérification…" : "Ouvrir ma carte"}
            </button>
          </form>
          <a href={`/${slug}`} className="ws-switch">
            Ce n&apos;est pas ma carte : créer la mienne
          </a>
        </section>
      </main>
    </div>
  );
}
