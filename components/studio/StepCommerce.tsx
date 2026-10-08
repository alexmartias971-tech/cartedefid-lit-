"use client";

import { TRADES } from "./content";
import type { Draft, Images } from "./state";
import { Choice, Field, Guide, ImagePicker, More, Section, Toggle } from "./ui";

export default function StepCommerce({
  d,
  set,
  images,
  pickLogo,
  removeLogo,
  chooseTrade,
  isNew,
  logoOnArt,
  setLogoOnArt,
  error,
  logoInfo,
  answerName,
  keepWhite,
  logoSize,
  setLogoSize,
  centerLogo,
  logoBg,
  setLogoBg,
  hasPhoto,
  logoWarnings,
}: {
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  images: Images;
  pickLogo: (f: File) => void;
  removeLogo: () => void;
  chooseTrade: (id: string) => void;
  isNew: boolean;
  logoOnArt: boolean;
  setLogoOnArt: (on: boolean) => void;
  error: (field: string) => string | null;
  logoInfo: { ask: boolean; original: File | null };
  answerName: (written: boolean) => void;
  keepWhite: () => void;
  logoSize: number | null;
  setLogoSize: (n: number) => void;
  centerLogo: () => void;
  logoBg: boolean;
  setLogoBg: (on: boolean) => void;
  hasPhoto: boolean;
  logoWarnings: string[];
}) {
  const hasLogo = !!images.logo.preview;
  const trades = (
    <div className="wz-trades" role="radiogroup" aria-label="Type de commerce">
      {TRADES.map((t) => (
        <Choice key={t.id} on={d.trade === t.id} onClick={() => chooseTrade(t.id)} title={t.label} icon={t.emoji} className="wz-choice-sm" />
      ))}
    </div>
  );
  return (
    <div className="wz-step">
      <Guide title={isNew ? "Bienvenue ! Créons votre carte en 5 minutes." : "Votre commerce"}>
        {isNew
          ? "Répondez simplement : la carte se construit sous vos yeux, dans l'aperçu. Vous pourrez tout modifier ensuite."
          : "Le nom et le logo qui s'affichent en haut de la carte."}
      </Guide>

      {isNew ? (
        <Section title="Quel est votre commerce ?" hint="On prépare une carte adaptée : le cadeau, le nombre de passages et les couleurs.">
          {trades}
          <p className="wz-hint">{TRADES.find((t) => t.id === d.trade)?.why}</p>
        </Section>
      ) : (
        <More title="Repartir d'un modèle de métier" hint="Remplace la récompense et les couleurs (le nom, le logo et les photos sont gardés).">
          {trades}
        </More>
      )}

      <Section title="Le nom et le logo">
        <Field
          label="Nom de votre commerce"
          htmlFor="wz-name"
          error={error("name")}
          hint={d.name.length > 20 ? `Sur Android, seuls les 20 premiers caractères s'affichent : « ${d.name.slice(0, 20)} ».` : "Tel que vos clients le connaissent."}
        >
          <input id="wz-name" className="wz-input wz-input-lg" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex : Coffee Plage" maxLength={60} autoComplete="organization" />
        </Field>

        <ImagePicker
          slot={images.logo}
          onPick={pickLogo}
          onRemove={removeLogo}
          label="Votre logo"
          empty="Ajouter votre logo"
          contain
          hint={
            hasLogo
              ? "Il apparaît en haut de la carte (en petit, Apple et Google imposent sa taille). Vous pouvez aussi le mettre en grand sur le visuel."
              : "Un fichier PNG à fond transparent rend le mieux. Pas de logo ? Pas de souci : le nom de votre commerce s'affiche à la place."
          }
        />

        {hasLogo && logoInfo.original && (
          <p className="wz-tip">
            Nous avons retiré le fond blanc de votre logo pour qu&apos;il se pose bien sur la carte.{" "}
            <button type="button" className="wz-link" onClick={keepWhite}>Garder le fond blanc</button>
          </p>
        )}

        {hasLogo && logoInfo.ask && (
          <div className="wz-ask" role="group" aria-label="Le nom est-il écrit sur le logo ?">
            <b>Le nom « {d.name.trim() || "de votre commerce"} » est-il déjà écrit sur ce logo ?</b>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="wz-btn wz-btn-soft" onClick={() => answerName(true)}>Oui, il est dessus</button>
              <button type="button" className="wz-btn wz-btn-ghost" onClick={() => answerName(false)}>Non</button>
            </div>
            <span className="wz-hint">Pour ne pas l&apos;afficher deux fois sur la carte.</span>
          </div>
        )}

        {hasLogo && (
          <div className="wz-row">
            <Toggle checked={logoOnArt} onChange={setLogoOnArt} label="Logo en grand sur la carte" hint="Faites-le glisser sur l'aperçu, ou réglez sa taille ici." />
            {logoOnArt && logoSize !== null && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="wz-field min-w-[200px] flex-1">
                  <span className="wz-hint">Taille du logo</span>
                  <input type="range" min={6} max={80} step={0.5} value={logoSize} onChange={(e) => setLogoSize(Number(e.target.value))} className="wz-range" aria-label="Taille du logo" />
                </label>
                <button type="button" className="wz-btn wz-btn-ghost" onClick={centerLogo}>↔ Centrer</button>
              </div>
            )}
            {logoOnArt && (
              <Toggle
                checked={logoBg}
                onChange={setLogoBg}
                label="Pastille blanche derrière le logo"
                hint={hasPhoto ? "Conseillé sur une photo : votre logo se lit à coup sûr." : "Utile si vous ajoutez ensuite une photo de fond."}
              />
            )}
            {logoOnArt && logoWarnings.map((w) => <p key={w} className="wz-warn">{w}</p>)}
          </div>
        )}

        {hasLogo && !logoInfo.ask && (
          <p className="wz-hint">
            {d.show_logo_text ? "Le nom de votre commerce s'affiche aussi en haut de la carte. " : "Le nom n'est pas répété en haut de la carte (il est déjà sur votre logo). "}
            <button type="button" className="wz-link" onClick={() => set({ show_logo_text: !d.show_logo_text })}>
              {d.show_logo_text ? "Ne pas l'afficher" : "L'afficher quand même"}
            </button>
          </p>
        )}
        {hasLogo && (
          <More title="Comment le haut de la carte s'affiche sur chaque téléphone">
            <ul className="wz-hint list-disc space-y-1 pl-5">
              <li>Apple et Google affichent votre logo en petit en haut de la carte : c&apos;est lui qu&apos;on voit quand les cartes sont empilées dans le Wallet.</li>
              <li>iPhone à jour : le logo seul. iPhone plus ancien : le logo, suivi du nom si vous l&apos;affichez.</li>
              <li>Android : un logo rond suivi du nom ; si le nom est masqué, votre logo s&apos;affiche en large à la place des deux.</li>
            </ul>
          </More>
        )}
      </Section>
    </div>
  );
}
