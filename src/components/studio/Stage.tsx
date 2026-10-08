"use client";

import CardPreview, { type CardEditorHooks } from "@/components/CardPreview";
import type { ArtFormat } from "@/lib/layout";
import { MOMENTS, SAMPLE_NAME, type Moment, type usePreview } from "./preview";
import type { Draft, Images } from "./state";

export const PLATFORMS: { id: ArtFormat; label: string; short: string; hint: string }[] = [
  { id: "poster", label: "iPhone", short: "iPhone", hint: "iPhone à jour (iOS 27) : la photo occupe toute la carte." },
  { id: "google", label: "Android", short: "Android", hint: "Android (Google Wallet) : logo rond, QR code, puis votre image en bas." },
  { id: "apple", label: "Ancien iPhone", short: "Ancien", hint: "iPhone pas encore mis à jour (iOS 26 et avant) : la photo est un bandeau." },
];

type Preview = ReturnType<typeof usePreview>;

export default function Stage({
  d,
  images,
  pv,
  platform,
  setPlatform,
  compare,
  setCompare,
  moment,
  setMoment,
  forcedTier,
  setForcedTier,
  editor,
  note,
}: {
  d: Draft;
  images: Images;
  pv: Preview;
  platform: ArtFormat;
  setPlatform: (p: ArtFormat) => void;
  compare: boolean;
  setCompare: (v: boolean) => void;
  moment: Moment;
  setMoment: (m: Moment) => void;
  forcedTier: string;
  setForcedTier: (k: string) => void;
  editor?: CardEditorHooks;
  note?: React.ReactNode;
}) {
  const card = (p: ArtFormat, ed?: CardEditorHooks, compact?: boolean) => (
    <CardPreview
      platform={p}
      businessName={d.name}
      logoUrl={images.logo.preview}
      customerName={SAMPLE_NAME}
      design={pv.design}
      state={pv.state}
      photoUrl={pv.photoFor(p)}
      progress={pv.progress}
      slots={pv.slots}
      couponsCount={pv.coupons}
      editor={ed}
      compact={compact}
    />
  );
  const current = PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0];
  return (
    <div className="wz-stage">
      <div className="wz-stage-bar">
        <div className="wz-seg wz-seg-sm" role="radiogroup" aria-label="Téléphone">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={!compare && platform === p.id}
              onClick={() => {
                setCompare(false);
                setPlatform(p.id);
              }}
            >
              <span className="hidden sm:inline">{p.label}</span>
              <span className="sm:hidden">{p.short}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={compare} onClick={() => setCompare(true)}>
            Les 3
          </button>
        </div>
      </div>

      {compare ? (
        <div className="wz-compare">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="wz-compare-item"
              onClick={() => {
                setPlatform(p.id);
                setCompare(false);
              }}
              aria-label={`Modifier la version ${p.label}`}
            >
              <span className="wz-compare-label">{p.label}</span>
              <span className="wz-compare-card">{card(p.id, undefined, true)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="wz-stage-card">{card(platform, editor)}</div>
      )}

      <p className="wz-stage-hint">{compare ? "Vos clients voient l'une de ces 3 versions, selon leur téléphone. Touchez-en une pour la modifier." : current.hint}</p>
      {note}

      <div className="wz-moments">
        <span className="wz-hint">Exemple : la carte de votre cliente {SAMPLE_NAME}</span>
        <div className="wz-seg wz-seg-sm" role="radiogroup" aria-label="Moment de la carte">
          {MOMENTS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={moment === m.id} onClick={() => setMoment(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {d.tiers_enabled && pv.tiers.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="wz-hint">Niveau :</span>
            <button type="button" className={`wz-chip ${forcedTier === "" ? "wz-chip-on" : ""}`} onClick={() => setForcedTier("")}>Auto</button>
            {pv.tiers.map((t) => (
              <button key={t.id} type="button" className={`wz-chip ${forcedTier === t.id ? "wz-chip-on" : ""}`} onClick={() => setForcedTier(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
