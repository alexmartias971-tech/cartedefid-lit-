"use client";

import { useActionState } from "react";
import type { SignupState } from "./actions";

export default function SignupForm({
  action,
  businessName,
}: {
  action: (prev: SignupState, fd: FormData) => Promise<SignupState>;
  businessName: string;
}) {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {/* Champ piège anti-robots, invisible pour les humains */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="site_web">Ne pas remplir</label>
        <input id="site_web" name="site_web" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="first_name" className="label">
            Prénom *
          </label>
          <input id="first_name" name="first_name" required autoComplete="given-name" className="input" />
        </div>
        <div>
          <label htmlFor="last_name" className="label">
            Nom
          </label>
          <input id="last_name" name="last_name" autoComplete="family-name" className="input" />
        </div>
      </div>
      <div>
        <label htmlFor="phone" className="label">
          Téléphone
        </label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" className="input" placeholder="0690 00 00 00" />
      </div>
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" className="input" />
        <p className="hint">Téléphone ou email : au moins l&apos;un des deux.</p>
      </div>
      <div>
        <label htmlFor="birth_date" className="label">
          Date de naissance (facultatif, pour une surprise 🎂)
        </label>
        <input id="birth_date" name="birth_date" type="date" className="input" />
      </div>

      <label className="flex gap-3 items-start text-sm">
        <input type="checkbox" name="marketing" className="mt-1 h-5 w-5 shrink-0" />
        <span>
          J&apos;accepte de recevoir les offres de {businessName} par notification sur ma carte (2 maximum par semaine,
          désactivable à tout moment).
        </span>
      </label>
      <label className="flex gap-3 items-start text-sm">
        <input type="checkbox" name="privacy" required className="mt-1 h-5 w-5 shrink-0" />
        <span>
          J&apos;accepte la{" "}
          <a href="/confidentialite" target="_blank" className="underline">
            politique de confidentialité
          </a>{" "}
          *
        </span>
      </label>

      {state.error && <p className="alert-error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full text-lg py-3.5">
        {pending ? "Création de ta carte..." : "Créer ma carte de fidélité"}
      </button>
    </form>
  );
}
