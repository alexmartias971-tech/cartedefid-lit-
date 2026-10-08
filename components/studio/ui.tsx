"use client";
/* eslint-disable @next/next/no-img-element */

/* Petits éléments d'interface de l'éditeur Walty (thème sombre, gros boutons faciles au doigt). */

import { useId, useRef, useState } from "react";
import { mascotSvg } from "@/lib/mascot";
import { ACCEPT } from "./images";
import type { ImageSlot } from "./state";

export function Section({ title, hint, children, aside, id }: { title: string; hint?: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  return (
    <section className="wz-card" id={id}>
      <div className="wz-card-head">
        <div className="min-w-0">
          <h3 className="wz-h3">{title}</h3>
          {hint && <p className="wz-hint mt-1">{hint}</p>}
        </div>
        {aside}
      </div>
      <div className="wz-card-body">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, htmlFor, error }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string; error?: string | null }) {
  return (
    <div className="wz-field">
      <label htmlFor={htmlFor} className="wz-label">{label}</label>
      {children}
      {error ? <p className="wz-error" role="alert">{error}</p> : hint ? <p className="wz-hint">{hint}</p> : null}
    </div>
  );
}

/** Interrupteur on/off. */
export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: React.ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={`wz-toggle ${disabled ? "opacity-50" : ""}`}>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`wz-switch ${checked ? "wz-switch-on" : ""}`}>
        <span />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-[15px] font-semibold leading-tight">{label}</span>
        {hint && <span className="wz-hint mt-0.5 block">{hint}</span>}
      </label>
    </div>
  );
}

/** Nombre avec gros boutons − / +. */
export function Stepper({ value, onChange, min, max, step = 1, suffix, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string; label: string }) {
  const decimals = (String(step).split(".")[1] ?? "").length;
  const clamp = (n: number) => Number(Math.min(max, Math.max(min, Math.round((Number.isFinite(n) ? n : min) / step) * step)).toFixed(decimals));
  return (
    <div className="wz-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} : moins`} onClick={() => onChange(clamp(value - step))} disabled={value <= min}>−</button>
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
      {suffix && <span className="wz-stepper-suffix">{suffix}</span>}
      <button type="button" aria-label={`${label} : plus`} onClick={() => onChange(clamp(value + step))} disabled={value >= max}>+</button>
    </div>
  );
}

/** Choix parmi quelques options (boutons). */
export function Segmented<T extends string | number>({ value, onChange, options, label, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: "sm" | "md" }) {
  return (
    <div className={`wz-seg ${size === "sm" ? "wz-seg-sm" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SWATCHES: { c: string; n: string }[] = [
  { c: "#FFFFFF", n: "Blanc" },
  { c: "#111111", n: "Noir" },
  { c: "#FF5B1F", n: "Orange flamboyant" },
  { c: "#FFA23D", n: "Mangue" },
  { c: "#FFD166", n: "Soleil" },
  { c: "#FF2E7E", n: "Hibiscus" },
  { c: "#7B3CFF", n: "Crépuscule" },
  { c: "#2DE2C4", n: "Lagon" },
  { c: "#0E7C86", n: "Turquoise" },
  { c: "#2B1D16", n: "Café" },
  { c: "#A7D46F", n: "Matcha" },
  { c: "#F3ECE3", n: "Sable" },
];

/** Couleur : pastilles nommées + pipette libre. */
export function ColorPick({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="wz-field">
      <span className="wz-label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((s) => (
          <button
            key={s.c}
            type="button"
            title={s.n}
            aria-label={s.n}
            aria-pressed={value.toLowerCase() === s.c.toLowerCase()}
            onClick={() => onChange(s.c)}
            className="wz-swatch"
            style={{ background: s.c }}
          />
        ))}
        <label className="wz-swatch wz-swatch-free" title="Autre couleur">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} : autre couleur`} />
          <span style={{ background: value }} />
        </label>
      </div>
    </div>
  );
}

/** Bloc repliable « pour aller plus loin ». */
export function More({ title, children, defaultOpen = false, hint }: { title: string; children: React.ReactNode; defaultOpen?: boolean; hint?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="wz-more">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="wz-more-head">
        <span>
          <span className="block">{title}</span>
          {hint && <span className="wz-hint block font-normal">{hint}</span>}
        </span>
        <span aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open && <div className="wz-more-body">{children}</div>}
    </div>
  );
}

/** Walty explique : la mascotte (dessin d'origine) et une bulle d'aide. */
export function Guide({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="wz-guide">
      <svg viewBox="0 0 180 134" className="wz-guide-walty" aria-hidden="true" dangerouslySetInnerHTML={{ __html: mascotSvg("peek", 90, 67, 134, "guide") }} />
      <div className="wz-guide-bubble">
        {title && <b className="block">{title}</b>}
        {children}
      </div>
    </div>
  );
}

/** Choisir une image (logo, photo) : aperçu, envoi en cours, changer, retirer. */
export function ImagePicker({
  slot,
  onPick,
  onRemove,
  label,
  empty,
  hint,
  contain,
}: {
  slot: ImageSlot;
  onPick: (file: File) => void;
  onRemove?: () => void;
  label: string;
  empty: string;
  hint?: React.ReactNode;
  contain?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="wz-field">
      <span className="wz-label">{label}</span>
      <button
        type="button"
        aria-label={slot.preview ? `${label} : changer l'image` : empty}
        className={`wz-drop ${over ? "wz-drop-over" : ""} ${slot.preview ? "wz-drop-full" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onPick(f);
        }}
      >
        {slot.preview ? (
          <img src={slot.preview} alt="" className={contain ? "wz-drop-img-contain" : "wz-drop-img"} />
        ) : (
          <span className="wz-drop-empty">
            <span className="wz-drop-plus" aria-hidden="true">＋</span>
            {empty}
          </span>
        )}
        {slot.uploading && <span className="wz-drop-busy">Envoi…</span>}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        {slot.preview && (
          <button type="button" className="wz-link" onClick={() => input.current?.click()}>Changer</button>
        )}
        {slot.preview && onRemove && (
          <button type="button" className="wz-link wz-link-muted" onClick={onRemove}>Retirer</button>
        )}
      </div>
      {slot.error ? <p className="wz-error" role="alert">{slot.error}</p> : hint ? <p className="wz-hint">{hint}</p> : null}
    </div>
  );
}

/** Grande option illustrée (choix du métier, de la mécanique, du style). */
export function Choice({
  on,
  onClick,
  title,
  text,
  badge,
  icon,
  className = "",
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  text?: React.ReactNode;
  badge?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className={`wz-choice ${on ? "wz-choice-on" : ""} ${className}`}>
      {badge && <span className="wz-badge">{badge}</span>}
      {icon && <span className="wz-choice-icon" aria-hidden="true">{icon}</span>}
      <span className="wz-choice-title">{title}</span>
      {text && <span className="wz-choice-text">{text}</span>}
    </button>
  );
}
