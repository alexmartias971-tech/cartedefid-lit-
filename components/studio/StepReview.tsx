"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { describeProgram } from "@/lib/card-state";
import type { Business } from "@/lib/types";
import { promise, type Draft } from "./state";
import { Guide, Section } from "./ui";

const STEP_NAMES = ["Votre commerce", "La récompense", "Le look", "Infos et bonus"];

export default function StepReview({
  d,
  business,
  problems,
  goTo,
  warnings = [],
}: {
  d: Draft;
  business?: Business;
  problems: { step: number; field: string; message: string }[];
  goTo: (step: number) => void;
  /** Éléments posés sur les tampons ou le QR code (sur l'un des téléphones). */
  warnings?: string[];
}) {
  const rules = useMemo(
    () =>
      describeProgram(
        {
          mode: d.mode,
          reward_threshold: d.reward_threshold,
          reward_description: d.reward_description.trim() || "…",
          points_per_euro: d.points_per_euro,
          cashback_percent: d.cashback_percent,
          tiers_enabled: d.tiers_enabled,
          tier_basis: d.tier_basis,
          progress_style: d.progress_style,
          max_stamps_per_day: d.max_stamps_per_day,
          signup_bonus: d.signup_bonus,
          streak_enabled: d.streak_enabled,
          streak_goal: d.streak_goal,
          streak_bonus: d.streak_bonus,
          streak_reminder_dow: d.streak_reminder_dow,
          streak_reminder_hour: d.streak_reminder_hour,
          lap_times_enabled: d.lap_times_enabled,
          referral_bonus: d.referral_bonus,
          bonus_multiplier: d.bonus_multiplier,
          bonus_start_hour: d.bonus_multiplier > 1 ? d.bonus_start_hour : null,
          bonus_end_hour: d.bonus_multiplier > 1 ? d.bonus_end_hour : null,
          welcome_offer: d.welcome_offer.trim() || null,
          birthday_offer: d.birthday_offer.trim() || null,
        },
        d.tiers.filter((t) => t.name.trim()).map((t) => ({ name: t.name, min_value: Number(t.min_value) || 0, perk: t.perk || null })),
      ),
    [d],
  );

  const [signup, setSignup] = useState<{ url: string; qr: string } | null>(null);
  useEffect(() => {
    if (!business?.slug) return;
    const url = `${window.location.origin}/c/${business.slug}`;
    QRCode.toDataURL(url, { width: 360, margin: 1 }).then((qr) => setSignup({ url, qr }));
  }, [business?.slug]);

  const blocking = problems.filter((p) => p.step >= 0);
  return (
    <div className="wz-step">
      <Guide title={blocking.length ? "Presque fini !" : business ? "Tout est prêt." : "Votre carte est prête !"}>
        {blocking.length
          ? "Il manque encore une ou deux informations avant de publier."
          : "Vérifiez une dernière fois les 3 versions de la carte dans l'aperçu, puis publiez. Vous pourrez tout modifier ensuite."}
      </Guide>

      {blocking.length > 0 && (
        <Section title="À compléter">
          <ul className="wz-todo">
            {blocking.map((p) => (
              <li key={p.field}>
                <span>{p.message}</span>
                <button type="button" className="wz-link" onClick={() => goTo(p.step)}>{STEP_NAMES[p.step] ?? "Corriger"} →</button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {warnings.length > 0 && (
        <Section title="À vérifier sur la carte">
          <ul className="wz-todo">
            {warnings.map((w) => (
              <li key={w}>
                <span>{w}</span>
                <button type="button" className="wz-link" onClick={() => goTo(2)}>Le look →</button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Ce que vos clients vont lire" hint="Au dos de leur carte, rubrique « Comment ça marche ».">
        <p className="wz-promise">{promise(d)}</p>
        <ul className="wz-rules">
          {rules.map((r) => (
            <li key={r.title + r.text}>
              <span aria-hidden="true">{r.icon}</span>
              <span>
                <b>{r.title} : </b>
                {r.text}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Ce qui fera revenir vos clients" hint="Ce que montrent les études sur les cartes de fidélité.">
        <ul className="wz-rules">
          <li>
            <span aria-hidden="true">🎁</span>
            <span>
              <b>Une carte déjà commencée.</b> Elle se remplit environ 20 % plus vite : c&apos;est ce qu&apos;a mesuré une étude dans un café{" "}
              <span className="wz-hint">(Université Columbia, 2006)</span>.{" "}
              {d.mode !== "cashback" && d.signup_bonus === 0 && (
                <button type="button" className="wz-link" onClick={() => goTo(1)}>Offrir des tampons au départ →</button>
              )}
            </span>
          </li>
          <li>
            <span aria-hidden="true">🙌</span>
            <span>
              <b>Un cadeau proche.</b> Les clients reviennent plus souvent à mesure qu&apos;ils s&apos;approchent du cadeau : la carte le leur rappelle à chaque passage (« Plus que 2 passages »).
            </span>
          </li>
          <li>
            <span aria-hidden="true">📣</span>
            <span>
              <b>Qu&apos;on la propose en caisse.</b> Posez l&apos;affiche avec le QR code sur le comptoir et proposez la carte à chaque client : l&apos;inscription prend moins d&apos;une minute.
            </span>
          </li>
        </ul>
        <p className="wz-hint">Une belle carte donne envie de l&apos;ajouter et de la garder dans son téléphone ; ce sont ces 3 points qui font revenir.</p>
      </Section>

      {!business && (
        <p className="wz-tip">Après la publication, un QR code vous permettra d&apos;ajouter la carte à votre propre téléphone pour la voir en vrai, et d&apos;imprimer l&apos;affiche du comptoir.</p>
      )}

      {business && signup && (
        <Section title="Testez votre carte sur votre téléphone" hint="Scannez ce QR code avec l'appareil photo : vous vous inscrivez comme un client et recevez la vraie carte.">
          <div className="flex flex-wrap items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signup.qr} alt="QR code d'inscription" className="h-36 w-36 rounded-xl bg-white p-2" />
            <div className="space-y-2 text-sm">
              <p className="wz-hint break-all">{signup.url}</p>
              <a className="wz-btn wz-btn-ghost" href={`/admin/entreprises/${business.id}/kit`}>Imprimer l&apos;affiche du comptoir</a>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
