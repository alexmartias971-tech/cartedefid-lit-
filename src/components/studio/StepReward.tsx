"use client";

import { useState } from "react";
import { computeCardState, formatEuro } from "@/lib/card-state";
import type { RewardMode } from "@/lib/types";
import { BONUS_HELP, MODE_GUIDES, MODE_QUIZ, TRADES } from "./content";
import { fmtNum, suggestedStart, type Draft } from "./state";
import { newKey } from "./shared";
import { Choice, Field, Guide, More, Section, Segmented, Stepper } from "./ui";

/** Fréquence de visite d'un habitué (passages par semaine), pour estimer le temps qu'il faut pour remplir la carte. */
const FREQUENCIES: { value: number; label: string }[] = [
  { value: 5, label: "Presque tous les jours" },
  { value: 2, label: "2 fois par semaine" },
  { value: 1, label: "1 fois par semaine" },
  { value: 0.5, label: "2 fois par mois" },
  { value: 0.25, label: "1 fois par mois" },
];
const TRADE_FREQ: Record<string, number> = { cafe: 2, boulangerie: 5, snack: 1, beaute: 0.25, sport: 1, boutique: 0.5, autre: 1 };

function weeksLabel(weeks: number): string {
  if (weeks <= 1) return "moins d'une semaine";
  if (weeks < 8) return `${Math.round(weeks)} semaines`;
  return `${Math.round(weeks / 4.3)} mois`;
}

export default function StepReward({ d, set, error }: { d: Draft; set: (patch: Partial<Draft>) => void; error: (field: string) => string | null }) {
  const trade = TRADES.find((t) => t.id === d.trade) ?? TRADES[0];
  const guide = MODE_GUIDES.find((m) => m.value === d.mode) ?? MODE_GUIDES[0];
  const [freq, setFreq] = useState<number>(TRADE_FREQ[d.trade] ?? 1);
  const [basket, setBasket] = useState(8);
  const [quiz, setQuiz] = useState<{ same?: boolean; gift?: boolean }>({});
  const quizResult: RewardMode | null = quiz.same === true ? "stamps" : quiz.same === false && quiz.gift !== undefined ? (quiz.gift ? "points" : "cashback") : null;

  const chooseMode = (mode: RewardMode) => {
    const patch: Partial<Draft> = { mode };
    if (mode === "stamps" && d.signup_bonus > d.reward_threshold - 1) patch.signup_bonus = suggestedStart(d.reward_threshold);
    if (mode === "points" && d.signup_bonus > 0 && d.mode === "stamps") patch.signup_bonus = 0;
    if (mode === "points" && d.catalog.length === 0)
      patch.catalog = [
        { key: newKey(), name: "1 boisson offerte", cost: "50" },
        { key: newKey(), name: "1 dessert offert", cost: "100" },
      ];
    if (mode === "stamps" && d.progress_style === "none") patch.progress_style = "glass";
    set(patch);
  };

  // Ce que lira le client, calculé avec les vrais réglages (même phrase que sur la carte)
  const clientSentence = (() => {
    const catalog = d.catalog
      .filter((r) => r.name.trim() && Number(r.cost) > 0)
      .map((r, i) => ({ id: r.key, program_id: "", name: r.name, cost: Number(r.cost), is_active: true, sort: i }));
    const first = Math.min(...catalog.map((r) => r.cost), 100);
    const st = computeCardState(
      {
        mode: d.mode,
        reward_threshold: d.reward_threshold,
        reward_description: d.reward_description.trim() || "ton cadeau",
        points_per_euro: d.points_per_euro || 1,
        cashback_percent: d.cashback_percent || 5,
        tiers_enabled: false,
        tier_basis: "visits",
        progress_style: d.progress_style,
      },
      {
        stamps_count: Math.max(1, d.reward_threshold - 3),
        points_balance: Math.round(first * 0.6),
        cashback_balance: 4.5,
        lifetime_visits: 6,
        lifetime_spent: 90,
        tier_id: null,
      },
      [],
      catalog,
    );
    return st.sentence;
  })();

  // Temps pour remplir la carte (tampons) ou pour le 1er cadeau (points)
  const stampsLeft = Math.max(1, d.reward_threshold - Math.min(d.signup_bonus, d.reward_threshold - 1));
  const stampWeeks = stampsLeft / freq;
  const firstCost = Math.min(...d.catalog.map((r) => Number(r.cost)).filter((n) => n > 0), Infinity);
  const pointsPerWeek = basket * (d.points_per_euro || 1) * freq;
  const pointWeeks = Number.isFinite(firstCost) ? Math.max(0, firstCost - (d.mode === "points" ? d.signup_bonus : 0)) / Math.max(0.01, pointsPerWeek) : null;
  const verdict = (weeks: number) =>
    weeks <= 4
      ? { tone: "ok", text: "Parfait : un cadeau proche donne envie de revenir." }
      : weeks <= 8
        ? { tone: "ok", text: "Bien. Au-delà de 2 mois, beaucoup de clients abandonnent leur carte en route." }
        : { tone: "warn", text: "C'est long : beaucoup de clients abandonneront en route. Réduisez le nombre de passages ou offrez des tampons au départ." };

  return (
    <div className="wz-step">
      <Guide title="Comment vos clients gagnent-ils ?">
        Choisissez une façon de récompenser. Pour {trade.label.toLowerCase()}, nous conseillons : <b>{MODE_GUIDES.find((m) => m.value === trade.mode)?.title}</b>.
      </Guide>

      <div className="wz-modes" role="radiogroup" aria-label="Façon de gagner">
        {MODE_GUIDES.map((m) => (
          <Choice
            key={m.value}
            on={d.mode === m.value}
            onClick={() => chooseMode(m.value)}
            title={m.title}
            text={m.pitch}
            badge={m.value === trade.mode ? "Conseillé pour vous" : m.badge}
            icon={m.value === "stamps" ? "🎟️" : m.value === "points" ? "⭐" : "💶"}
          />
        ))}
      </div>

      <section className="wz-explain" aria-label={`Comment fonctionnent les ${guide.title.toLowerCase()}`}>
        <h3 className="wz-h3">Comment ça marche</h3>
        <ol className="wz-how">
          {guide.how.map((h, i) => (
            <li key={i}>
              <span className="wz-how-num">{i + 1}</span>
              <span className="wz-how-emoji" aria-hidden="true">{h.emoji}</span>
              <span>{h.text}</span>
            </li>
          ))}
        </ol>
        <dl className="wz-facts">
          <div>
            <dt>Idéal pour</dt>
            <dd>{guide.ideal}</dd>
          </div>
          <div>
            <dt>Votre client lit sur sa carte</dt>
            <dd>« {clientSentence} »</dd>
          </div>
          <div>
            <dt>À savoir</dt>
            <dd>{guide.watch}</dd>
          </div>
        </dl>
        <More title="Je ne sais pas quoi choisir">
          <Field label={MODE_QUIZ.q1}>
            <Segmented value={quiz.same === undefined ? "" : quiz.same ? "oui" : "non"} onChange={(v) => setQuiz({ same: v === "oui" })} label={MODE_QUIZ.q1} options={[{ value: "oui", label: "Oui, à peu près" }, { value: "non", label: "Non, ça varie beaucoup" }]} />
          </Field>
          {quiz.same === false && (
            <Field label={MODE_QUIZ.q2}>
              <Segmented value={quiz.gift === undefined ? "" : quiz.gift ? "produits" : "euros"} onChange={(v) => setQuiz({ ...quiz, gift: v === "produits" })} label={MODE_QUIZ.q2} options={[{ value: "produits", label: "Des produits" }, { value: "euros", label: "Des euros" }]} />
            </Field>
          )}
          {quizResult && (
            <div className="wz-tip flex flex-wrap items-center justify-between gap-3">
              <span>
                Notre conseil : <b>{MODE_GUIDES.find((m) => m.value === quizResult)?.title}</b>.
              </span>
              {d.mode !== quizResult && (
                <button type="button" className="wz-btn wz-btn-soft" onClick={() => chooseMode(quizResult)}>Choisir</button>
              )}
            </div>
          )}
        </More>
      </section>

      {d.mode === "stamps" && (
        <Section title="Votre carte à tampons">
          <Field label="Le cadeau, quand la carte est pleine" htmlFor="wz-reward" error={error("reward")} hint="Un cadeau « plaisir » (un dessert, un soin) motive plus qu'une petite remise.">
            <input id="wz-reward" className="wz-input wz-input-lg" value={d.reward_description} onChange={(e) => set({ reward_description: e.target.value, ...(d.titleAuto ? {} : {}) })} placeholder="Ex : 1 café offert" maxLength={60} />
            <div className="flex flex-wrap gap-2 pt-1">
              {(trade.rewardIdeas.length ? trade.rewardIdeas : ["1 produit offert", "1 boisson offerte", "1 dessert offert"]).map((idea) => (
                <button key={idea} type="button" className={`wz-chip ${d.reward_description === idea ? "wz-chip-on" : ""}`} onClick={() => set({ reward_description: idea })}>{idea}</button>
              ))}
            </div>
          </Field>

          <div className="wz-grid2">
            <Field label="Nombre de passages pour le cadeau" hint={`Le cadeau représente environ ${Math.round(100 / (d.reward_threshold + 1))} % de ce que dépense un habitué (s'il vaut un passage).`}>
              <Stepper value={d.reward_threshold} onChange={(n) => set({ reward_threshold: n })} min={3} max={20} label="Nombre de passages" />
            </Field>
            <Field label="Tampons offerts à l'inscription" hint={BONUS_HELP.signup}>
              <Stepper value={Math.min(d.signup_bonus, Math.max(0, d.reward_threshold - 1))} onChange={(n) => set({ signup_bonus: n })} min={0} max={Math.min(5, d.reward_threshold - 1)} label="Tampons offerts à l'inscription" />
            </Field>
          </div>

          <div className="wz-coach">
            <Field label="Vos habitués viennent environ…">
              <select className="wz-input" value={freq} onChange={(e) => setFreq(Number(e.target.value))} aria-label="Fréquence de visite">
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>
            <p className={`wz-coach-out ${verdict(stampWeeks).tone === "warn" ? "wz-coach-warn" : ""}`}>
              Un habitué aura son cadeau en <b>{weeksLabel(stampWeeks)}</b>. {verdict(stampWeeks).text}
            </p>
          </div>
        </Section>
      )}

      {d.mode === "points" && (
        <Section title="Vos points et vos cadeaux">
          <Field label="Points gagnés par euro dépensé" hint={`Ex : un achat de 12 € donne ${fmtNum(Math.round(12 * (d.points_per_euro || 0) * 10) / 10)} points.`}>
            <Stepper value={d.points_per_euro} onChange={(n) => set({ points_per_euro: n })} min={0.1} max={100} step={0.1} label="Points par euro" />
          </Field>
          <div className="wz-field">
            <span className="wz-label">Les cadeaux à échanger</span>
            {error("catalog") && <p className="wz-error">{error("catalog")}</p>}
            {d.catalog.map((r, i) => (
              <div key={r.key} className="wz-reward-row">
                <div className="relative">
                  <input aria-label="Prix en points" type="number" min={1} className="wz-input pr-11" value={r.cost} onChange={(e) => set({ catalog: d.catalog.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)) })} />
                  <span className="wz-hint absolute right-3 top-1/2 -translate-y-1/2">pts</span>
                </div>
                <input aria-label="Cadeau" className="wz-input" value={r.name} placeholder="1 café offert" onChange={(e) => set({ catalog: d.catalog.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <button type="button" className="wz-icon-btn" aria-label="Retirer ce cadeau" onClick={() => set({ catalog: d.catalog.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="wz-btn wz-btn-ghost" onClick={() => set({ catalog: [...d.catalog, { key: newKey(), name: "", cost: "" }] })}>+ Ajouter un cadeau</button>
          </div>
          <div className="wz-coach">
            <div className="wz-grid2">
              <Field label="Panier moyen d'un client">
                <Stepper value={basket} onChange={setBasket} min={1} max={500} suffix="€" label="Panier moyen" />
              </Field>
              <Field label="Vos habitués viennent environ…">
                <select className="wz-input" value={freq} onChange={(e) => setFreq(Number(e.target.value))} aria-label="Fréquence de visite">
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Field>
            </div>
            {pointWeeks !== null && (
              <p className={`wz-coach-out ${verdict(pointWeeks).tone === "warn" ? "wz-coach-warn" : ""}`}>
                Un habitué gagne environ {Math.round(pointsPerWeek)} points par semaine : son 1er cadeau ({firstCost} points) arrive en <b>{weeksLabel(pointWeeks)}</b>. {verdict(pointWeeks).text}
              </p>
            )}
          </div>
          <Field label="Points offerts à l'inscription" hint="Facultatif : une carte qui ne démarre pas à zéro donne envie de continuer.">
            <Stepper value={d.signup_bonus} onChange={(n) => set({ signup_bonus: n })} min={0} max={1000} step={5} label="Points offerts à l'inscription" />
          </Field>
        </Section>
      )}

      {d.mode === "cashback" && (
        <Section title="Votre cagnotte">
          <Field label="Part de chaque achat qui revient au client" hint={`Ex : un achat de 40 € ajoute ${formatEuro((40 * (d.cashback_percent || 0)) / 100)} à sa cagnotte. Il l'utilise en réduction quand il veut.`}>
            <Stepper value={d.cashback_percent} onChange={(n) => set({ cashback_percent: n })} min={0.5} max={30} step={0.5} suffix="%" label="Cagnotte en pourcentage" />
          </Field>
          <p className="wz-tip">Ce que ça vous coûte : {fmtNum(d.cashback_percent)} € tous les 100 € dépensés par vos clients fidèles, uniquement quand ils utilisent leur cagnotte.</p>
        </Section>
      )}

      <More title="Bon à savoir en caisse" hint="Les règles qui évitent les erreurs (réglages conseillés déjà en place).">
        <Field label={d.mode === "stamps" ? "Tampons maximum par jour et par client" : "Passages maximum par jour et par client"} hint="1 est conseillé : même s'il passe deux fois dans la journée, le client gagne une seule fois.">
          <Stepper value={d.max_stamps_per_day} onChange={(n) => set({ max_stamps_per_day: n })} min={1} max={10} label="Maximum par jour" />
        </Field>
        {d.mode !== "stamps" && (
          <Field label="Montant maximum d'un achat" hint="Évite les fautes de frappe en caisse (1 200 € au lieu de 12,00 €).">
            <Stepper value={d.max_purchase_amount} onChange={(n) => set({ max_purchase_amount: n })} min={1} max={100000} step={10} suffix="€" label="Montant maximum" />
          </Field>
        )}
      </More>
    </div>
  );
}
