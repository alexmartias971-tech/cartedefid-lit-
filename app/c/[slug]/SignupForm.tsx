"use client";

import { useActionState, useState } from "react";
import type { SignupState } from "./actions";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/**
 * Inscription en 20 secondes : prénom + téléphone (ou e-mail). Le nom n'est demandé que pour le classement,
 * l'anniversaire (jour + mois, sans l'année) seulement si le commerce offre un cadeau d'anniversaire.
 */
export default function SignupForm({
  action,
  businessName,
  referral,
  leaderboard,
  birthday,
}: {
  action: (prev: SignupState, fd: FormData) => Promise<SignupState>;
  businessName: string;
  referral?: string | null;
  leaderboard?: boolean;
  birthday?: boolean;
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
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  // Nombre de jours du mois choisi (2000 est bissextile : le 29 février reste possible)
  const daysInMonth = month ? new Date(2000, Number(month), 0).getDate() : 31;
  const birthDate = day && month && Number(day) <= daysInMonth ? `2000-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";

  return (
    <form action={formAction} className="space-y-4">
      {referral && <input type="hidden" name="ref" value={referral} />}
      {/* Champ piège anti-robots, invisible pour les humains */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="site_web">Ne pas remplir</label>
        <input id="site_web" name="site_web" tabIndex={-1} autoComplete="off" />
      </div>

      <div className={leaderboard ? "grid grid-cols-2 gap-3" : ""}>
        <div>
          <label htmlFor="first_name" className="label">
            Ton prénom
          </label>
          <input id="first_name" name="first_name" required autoComplete="given-name" className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        {leaderboard && (
          <div>
            <label htmlFor="last_name" className="label">
              Ton nom (pour le classement)
            </label>
            <input id="last_name" name="last_name" autoComplete="family-name" className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        )}
      </div>

      {!byEmail ? (
        <div>
          <label htmlFor="phone" className="label">
            Ton téléphone
          </label>
          <input id="phone" name="phone" type="tel" inputMode="tel" required autoComplete="tel" className="input" placeholder="0690 00 00 00" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button type="button" className="hint underline" onClick={() => setByEmail(true)}>
            Je préfère donner mon e-mail
          </button>
        </div>
      ) : (
        <div>
          <label htmlFor="email" className="label">
            Ton e-mail
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="button" className="hint underline" onClick={() => setByEmail(false)}>
            Je préfère donner mon téléphone
          </button>
        </div>
      )}

      {birthday && (
        <div>
          <span className="label">Ton anniversaire (facultatif, pour une surprise 🎂)</span>
          <div className="grid grid-cols-2 gap-3">
            <select aria-label="Jour" className="input" value={day} required={!!month} onChange={(e) => setDay(e.target.value)}>
              <option value="">Jour</option>
              {Array.from({ length: daysInMonth }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
              ))}
            </select>
            <select
              aria-label="Mois"
              className="input"
              value={month}
              required={!!day}
              onChange={(e) => {
                const m = e.target.value;
                setMonth(m);
                if (m && Number(day) > new Date(2000, Number(m), 0).getDate()) setDay("");
              }}
            >
              <option value="">Mois</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>{m}</option>
              ))}
            </select>
          </div>
          {birthDate && <input type="hidden" name="birth_date" value={birthDate} />}
        </div>
      )}

      <label className="flex gap-3 items-start text-sm">
        <input type="checkbox" name="marketing" className="mt-1 h-5 w-5 shrink-0" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
        <span>
          Je veux recevoir les bons plans de {businessName} sur ma carte. Je peux arrêter à tout moment.
        </span>
      </label>
      {leaderboard && (
        <label className="flex gap-3 items-start text-sm">
          <input type="checkbox" name="leaderboard" className="mt-1 h-5 w-5 shrink-0" checked={board} onChange={(e) => setBoard(e.target.checked)} />
          <span>
            🏆 J&apos;accepte d&apos;apparaître au classement public des meilleurs temps (prénom + initiale du nom). Sinon, je
            suis affiché « Pilote anonyme ».
          </span>
        </label>
      )}
      <label className="flex gap-3 items-start text-sm">
        <input type="checkbox" name="privacy" required className="mt-1 h-5 w-5 shrink-0" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
        <span>
          J&apos;ai lu{" "}
          <a href="/confidentialite" target="_blank" className="underline">
            comment mes données sont utilisées
          </a>
        </span>
      </label>

      {state.error && <p className="alert-error">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full text-lg py-3.5">
        {pending ? "Création de ta carte..." : "Recevoir ma carte"}
      </button>
    </form>
  );
}
