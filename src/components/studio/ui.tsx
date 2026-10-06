"use client";

/* Petits éléments d'interface de l'éditeur (thème sombre Walty). */

import { useId, useState } from "react";

export function Section({ title, hint, children, aside }: { title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="st-card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="st-h3">{title}</h3>
          {hint && <p className="st-hint mt-1">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="st-label">{label}</label>
      {children}
      {hint && <p className="st-hint">{hint}</p>}
    </div>
  );
}

/** Interrupteur on/off (sans nom de champ : la valeur est envoyée par un champ caché). */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`st-switch ${checked ? "st-switch-on" : ""}`}
      >
        <span />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block font-semibold text-[15px] leading-tight">{label}</span>
        {hint && <span className="st-hint block mt-0.5">{hint}</span>}
      </label>
    </div>
  );
}

/** Nombre avec gros boutons − / + (facile au doigt). */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  label: string;
}) {
  const decimals = (String(step).split(".")[1] ?? "").length;
  const clamp = (n: number) => Number(Math.min(max, Math.max(min, Math.round((Number.isFinite(n) ? n : min) / step) * step)).toFixed(decimals));
  return (
    <div className="st-stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Moins" onClick={() => onChange(clamp(value - step))} disabled={value <= min}>−</button>
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === "" ? min : Number(e.target.value))}
        onBlur={(e) => onChange(clamp(Number(e.target.value)))}
      />
      {suffix && <span className="st-stepper-suffix">{suffix}</span>}
      <button type="button" aria-label="Plus" onClick={() => onChange(clamp(value + step))} disabled={value >= max}>+</button>
    </div>
  );
}

/** Choix parmi quelques options (boutons). */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="st-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const BRIGHTS = ["#FFFFFF", "#111111", "#FF5B1F", "#FFA23D", "#FFD166", "#FF2E7E", "#7B3CFF", "#2DE2C4", "#0E7C86", "#3B1F4A", "#2B1D16", "#8FD16A"];

/** Couleur : pastilles prêtes + pipette libre. */
export function ColorPick({ value, onChange, label, swatches = BRIGHTS }: { value: string; onChange: (v: string) => void; label: string; swatches?: string[] }) {
  return (
    <div className="space-y-2">
      <span className="st-label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Couleur ${c}`}
            aria-pressed={value.toLowerCase() === c.toLowerCase()}
            onClick={() => onChange(c)}
            className="st-swatch"
            style={{ background: c }}
          />
        ))}
        <label className="st-swatch st-swatch-free" title="Autre couleur">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} : autre couleur`} />
          <span style={{ background: value }} />
        </label>
      </div>
    </div>
  );
}

/** Bloc repliable « option » (pour garder les écrans simples). */
export function More({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="st-more">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="st-more-head">
        <span>{title}</span>
        <span aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      <div className={open ? "space-y-4 pt-3" : "hidden"}>{children}</div>
    </div>
  );
}
