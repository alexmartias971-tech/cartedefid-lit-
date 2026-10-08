"use client";

import { BONUS_HELP } from "./content";
import { emptyImage, type Draft, type TierDraft } from "./state";
import { newKey } from "./shared";
import { Field, Guide, ImagePicker, More, Section, Segmented, Stepper, Toggle } from "./ui";

const TIER_PRESETS: Omit<TierDraft, "key" | "image">[] = [
  { name: "Bronze", min_value: "0", perk: "", color: "#8C5A2B" },
  { name: "Argent", min_value: "10", perk: "-5 % sur tout", color: "#6B7280" },
  { name: "Or", min_value: "25", perk: "-10 % sur tout", color: "#A07A1F" },
];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export default function StepExtras({
  d,
  set,
  pickTierImage,
  error,
}: {
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  pickTierImage: (key: string, f: File) => void;
  error: (field: string) => string | null;
}) {
  const unit = d.mode === "stamps" ? "tampons" : d.mode === "points" ? "points" : "€";
  const setTier = (i: number, patch: Partial<TierDraft>) => set({ tiers: d.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  return (
    <div className="wz-step">
      <Guide title="Les infos pratiques et les petits plus">
        Tout est facultatif. Remplissez ce qui vous sert : vos clients le retrouvent au dos de leur carte.
      </Guide>

      <Section title="Au dos de la carte" hint="Vos clients y trouvent vos coordonnées, en touchant le bouton « … » de la carte.">
        <div className="wz-grid2">
          <Field label="Téléphone" htmlFor="wz-phone">
            <input id="wz-phone" className="wz-input" inputMode="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="0590 00 00 00" />
          </Field>
          <Field label="E-mail" htmlFor="wz-email">
            <input id="wz-email" className="wz-input" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </div>
        <Field label="Adresse" htmlFor="wz-address">
          <input id="wz-address" className="wz-input" value={d.address} onChange={(e) => set({ address: e.target.value })} placeholder="12 rue Principale, 97190 Le Gosier" />
        </Field>
        <Field label="Horaires et infos utiles" htmlFor="wz-back">
          <textarea id="wz-back" rows={3} className="wz-input" value={d.back_text} onChange={(e) => set({ back_text: e.target.value })} placeholder="Ouvert du lundi au samedi, 6 h – 19 h" />
        </Field>
        <div className="wz-grid2">
          <Field label="Instagram" htmlFor="wz-insta" hint="Votre nom de compte, par exemple @coffeeplage.">
            <input id="wz-insta" className="wz-input" value={d.instagram} onChange={(e) => set({ instagram: e.target.value })} placeholder="@moncommerce" />
          </Field>
          <Field label="Lien pour laisser un avis Google" htmlFor="wz-review" hint="Dans Google Maps : votre fiche > « Demander des avis ». Aucun cadeau en échange d'un avis : c'est la règle de Google.">
            <input id="wz-review" className="wz-input" type="url" value={d.google_review_url} onChange={(e) => set({ google_review_url: e.target.value })} placeholder="https://g.page/r/…" />
          </Field>
        </div>
        <More title="La carte apparaît quand le client passe devant chez vous" hint="Sur l'écran verrouillé de son téléphone, avec un petit message.">
          <div className="wz-grid2">
            <Field label="Latitude" htmlFor="wz-lat">
              <input id="wz-lat" className="wz-input" inputMode="decimal" value={d.latitude} onChange={(e) => set({ latitude: e.target.value })} placeholder="16.2040" />
            </Field>
            <Field label="Longitude" htmlFor="wz-lng">
              <input id="wz-lng" className="wz-input" inputMode="decimal" value={d.longitude} onChange={(e) => set({ longitude: e.target.value })} placeholder="-61.4930" />
            </Field>
          </div>
          <p className="wz-hint">Dans Google Maps, faites un clic droit sur votre commerce, puis cliquez sur les chiffres pour les copier : le 1er est la latitude, le 2e la longitude.</p>
          <Field label="Message affiché à proximité" htmlFor="wz-near" hint="Vos clients sont tutoyés.">
            <input id="wz-near" className="wz-input" maxLength={80} value={d.relevant_text} onChange={(e) => set({ relevant_text: e.target.value })} placeholder="Un iced latte face à la mer ? Ta carte est prête 🌴" />
          </Field>
        </More>
      </Section>

      <Section title="Pour faire revenir vos clients" hint="Activez seulement ce qui vous plaît. Vous pourrez changer à tout moment.">
        <Field label="Offre de bienvenue" htmlFor="wz-welcome" hint={BONUS_HELP.welcome}>
          <input id="wz-welcome" className="wz-input" value={d.welcome_offer} onChange={(e) => set({ welcome_offer: e.target.value })} placeholder="Ex : -10 % sur ton prochain achat (laissez vide pour ne rien offrir)" />
        </Field>

        {d.mode !== "cashback" && (
          <Field label={`Parrainage : ${unit} offerts au client quand un ami vient pour la 1re fois`} hint={`${BONUS_HELP.referral} 0 = désactivé.`}>
            <Stepper value={d.referral_bonus} onChange={(n) => set({ referral_bonus: n })} min={0} max={d.mode === "stamps" ? 5 : 1000} label="Bonus de parrainage" />
          </Field>
        )}

        <div className="wz-row">
          <Toggle checked={d.bonus_multiplier > 1} onChange={(on) => set({ bonus_multiplier: on ? 2 : 1 })} label={d.mode === "stamps" ? "Double tampon pendant vos heures calmes" : "Double gain pendant vos heures calmes"} hint={BONUS_HELP.happy} />
          {d.bonus_multiplier > 1 && (
            <div className="wz-grid3">
              <Field label="Gain">
                <Segmented value={d.bonus_multiplier} onChange={(n) => set({ bonus_multiplier: n })} label="Multiplicateur" options={[{ value: 2, label: "× 2" }, { value: 3, label: "× 3" }]} size="sm" />
              </Field>
              <Field label="De" htmlFor="wz-hs" error={error("happy")}>
                <select id="wz-hs" className="wz-input" value={d.bonus_start_hour} onChange={(e) => set({ bonus_start_hour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}
                </select>
              </Field>
              <Field label="À" htmlFor="wz-he">
                <select id="wz-he" className="wz-input" value={d.bonus_end_hour} onChange={(e) => set({ bonus_end_hour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h + 1} value={h + 1}>{h + 1} h</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>

        <More title="Encore plus d'idées" hint="Anniversaire, défi de la semaine, niveaux, classement… Utile surtout pour les clients très réguliers.">
          <Field label="Offre d'anniversaire" htmlFor="wz-bday" hint={BONUS_HELP.birthday}>
            <input id="wz-bday" className="wz-input" value={d.birthday_offer} onChange={(e) => set({ birthday_offer: e.target.value })} placeholder="Ex : 1 dessert offert pour ton anniversaire 🎂" />
          </Field>

          <div className="wz-row">
            <Toggle checked={d.streak_enabled} onChange={(on) => set({ streak_enabled: on })} label="Défi : venir chaque semaine" hint={BONUS_HELP.streak} />
            {d.streak_enabled && (
              <div className="wz-grid2">
                <Field label="Semaines d'affilée">
                  <Stepper value={d.streak_goal} onChange={(n) => set({ streak_goal: n })} min={2} max={52} label="Semaines d'affilée" />
                </Field>
                <Field label={`Bonus (${unit})`}>
                  <Stepper value={d.streak_bonus} onChange={(n) => set({ streak_bonus: n })} min={0} max={1000} label="Bonus du défi" />
                </Field>
                <Field label="Rappel le" htmlFor="wz-sdow">
                  <select id="wz-sdow" className="wz-input" value={d.streak_reminder_dow} onChange={(e) => set({ streak_reminder_dow: Number(e.target.value) })}>
                    {DAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}
                  </select>
                </Field>
                <Field label="à" htmlFor="wz-shour">
                  <select id="wz-shour" className="wz-input" value={d.streak_reminder_hour} onChange={(e) => set({ streak_reminder_hour: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>

          <div className="wz-row">
            <Toggle
              checked={d.tiers_enabled}
              onChange={(on) => set({ tiers_enabled: on, ...(on && d.tiers.length === 0 ? { tiers: TIER_PRESETS.map((t) => ({ ...t, key: newKey(), image: emptyImage() })) } : {}) })}
              label="Niveaux (Bronze, Argent, Or…)"
              hint={`${BONUS_HELP.tiers} Sur Android, la couleur de la carte ne change pas (limite de Google).`}
            />
            {d.tiers_enabled && (
              <div className="space-y-3">
                {error("tiers") && <p className="wz-error">{error("tiers")}</p>}
                <Field label="Le client monte de niveau selon">
                  <Segmented value={d.tier_basis} onChange={(b) => set({ tier_basis: b })} label="Base des niveaux" options={[{ value: "visits", label: "Ses passages" }, { value: "spend", label: "Ses achats (€)" }]} size="sm" />
                </Field>
                {d.tier_basis === "spend" && d.mode === "stamps" && <p className="wz-warn">Avec les tampons, vous ne tapez pas de montant en caisse : choisissez plutôt « Ses passages ».</p>}
                {d.tiers.map((t, i) => (
                  <div key={t.key} className="wz-tier">
                    <div className="wz-tier-grid">
                      <input aria-label="Nom du niveau" className="wz-input" value={t.name} placeholder="Or" onChange={(e) => setTier(i, { name: e.target.value })} />
                      <div className="relative">
                        <input aria-label="À partir de" type="number" min={0} className="wz-input pr-14" value={t.min_value} onChange={(e) => setTier(i, { min_value: e.target.value })} />
                        <span className="wz-hint absolute right-3 top-1/2 -translate-y-1/2">{d.tier_basis === "spend" ? "€" : "pass."}</span>
                      </div>
                      <input aria-label="Avantage" className="wz-input" value={t.perk} placeholder="Avantage : -10 % sur tout" onChange={(e) => setTier(i, { perk: e.target.value })} />
                      <label className="wz-swatch wz-swatch-free" title="Couleur de la carte à ce niveau">
                        <input type="color" value={t.color || d.background_color} onChange={(e) => setTier(i, { color: e.target.value })} aria-label={`Couleur du niveau ${t.name}`} />
                        <span style={{ background: t.color || d.background_color }} />
                      </label>
                      <button type="button" className="wz-icon-btn" aria-label="Retirer ce niveau" onClick={() => set({ tiers: d.tiers.filter((_, j) => j !== i) })}>✕</button>
                    </div>
                    <More title="Photo propre à ce niveau (facultatif)">
                      <ImagePicker
                        slot={t.image}
                        onPick={(f) => pickTierImage(t.key, f)}
                        onRemove={() => setTier(i, { image: emptyImage() })}
                        label={`Photo du niveau ${t.name || ""}`}
                        empty="Choisir une photo"
                        hint="Elle remplace la photo de fond quand le client atteint ce niveau."
                      />
                    </More>
                  </div>
                ))}
                <button type="button" className="wz-btn wz-btn-ghost" onClick={() => set({ tiers: [...d.tiers, { key: newKey(), name: "", min_value: "", perk: "", color: "", image: emptyImage() }] })}>+ Ajouter un niveau</button>
              </div>
            )}
          </div>

          {(d.trade === "sport" || d.lap_times_enabled || d.legacy.track) && (
            <div className="wz-row">
              <Toggle checked={d.lap_times_enabled} onChange={(on) => set({ lap_times_enabled: on })} label="Record et classement" hint={BONUS_HELP.lap} />
            </div>
          )}

          <Field label="Messages maximum par semaine" hint="Le nombre de notifications que vos clients peuvent recevoir de vous. 2 est conseillé, 0 = aucune.">
            <Stepper value={d.max_notifications_per_week} onChange={(n) => set({ max_notifications_per_week: n })} min={0} max={7} label="Messages par semaine" />
          </Field>
        </More>
      </Section>
    </div>
  );
}
