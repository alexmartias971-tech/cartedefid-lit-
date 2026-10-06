"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef } from "react";
import QRCode from "qrcode";
import {
  cardBannerSvg,
  cardPosterSvg,
  fieldLabels,
  posterFields,
  type CardDesign,
  type CardState,
  type Field as CardField,
  type ResolvedSlots,
} from "@/lib/card-state";
import { FORMATS, layerBox, layerSvg, stampsBox, type BannerOptions } from "@/lib/visual";
import { bannerOptions } from "@/lib/card-state";
import { SLOT_SOURCES, type ArtFormat, type CardLayout, type FieldSlot } from "@/lib/layout";

/**
 * Aperçu fidèle de la carte dans le Wallet, aux formats officiels :
 *  - "poster" : iPhone iOS 27 (photo sur toute la carte, 358 × 448)
 *  - "apple"  : iPhone iOS 26 et avant (bannière 375 × 144)
 *  - "google" : Android, Google Wallet (image héros 1032 × 336, en bas)
 * Les images sont dessinées avec exactement le même code que celles envoyées au téléphone,
 * et le QR code est un vrai QR code (scannable).
 */
export type PreviewProps = {
  platform: "poster" | "apple" | "google";
  businessName: string;
  logoUrl?: string | null;
  customerName: string;
  design: CardDesign;
  state: CardState;
  /** Photo à afficher (celle du niveau du client, sinon la photo principale). */
  photoUrl?: string | null;
  /** Progression dessinée (cases remplies / total). */
  progress: { total: number; filled: number };
  /** Deuxième champ sous la bannière (ex : CADEAU / prochain cadeau / taux de cashback). */
  secondary?: { label: string; value: string } | null;
  couponsCount?: number;
  /** Contenu du QR code (numéro de la carte). */
  qrValue?: string;
  /** Zones remplies selon la disposition de l'éditeur (sinon : disposition automatique). */
  slots?: ResolvedSlots | null;
  /** Mode éditeur : zones cliquables, textes modifiables sur place, calques déplaçables. */
  editor?: CardEditorHooks;
};

export type CardEditorHooks = {
  selected: string | null;
  onSelect: (zone: string | null) => void;
  onLayerChange: (id: string, change: { x?: number; y?: number; size?: number; rot?: number }, format: ArtFormat) => void;
  onStampsMove: (y: number, format: ArtFormat) => void;
  onSlotLabel: (slot: FieldSlot, label: string) => void;
  onSlotValue: (slot: FieldSlot | "foot", value: string) => void;
  onName: (name: string) => void;
  onProgramName: (name: string) => void;
  slotConfigs: CardLayout["slots"];
};

function QrSvg({ value, size }: { value: string; size: number }) {
  const path = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { d, n };
  }, [value]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${path.n} ${path.n}`} shapeRendering="crispEdges" role="img" aria-label="QR code de la carte">
      <rect width={path.n} height={path.n} fill="#ffffff" />
      <path d={path.d} fill="#000000" />
    </svg>
  );
}

function Logo({ url, name, bg, fg, size = 32, round }: { url?: string | null; name: string; bg: string; fg: string; size?: number; round?: boolean }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const style = { width: size, height: size };
  if (url) return <img src={url} alt="" style={style} className={`object-contain ${round ? "rounded-full bg-white" : "rounded-md"}`} />;
  return (
    <span style={{ ...style, background: fg, color: bg }} className={`grid place-items-center font-bold ${round ? "rounded-full" : "rounded-md"}`}>
      {initial}
    </span>
  );
}

function Field({ label, value, color, align, big }: { label: string; value: string; color: string; align?: "right"; big?: boolean }) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <div className="text-[10px] font-semibold tracking-wider truncate" style={{ color }}>
        {label}
      </div>
      <div className={`${big ? "text-[15px]" : "text-[14px]"} leading-tight truncate`}>{value}</div>
    </div>
  );
}

const Svg = ({ html, ratio }: { html: string; ratio: string }) => (
  <div className="w-full [&>svg]:w-full [&>svg]:h-full" style={{ aspectRatio: ratio }} dangerouslySetInnerHTML={{ __html: html }} />
);

function LegacyCard(p: PreviewProps) {
  const d = p.design;
  const bg = p.state.tier?.color || d.backgroundColor;
  const design = useMemo(() => ({ ...d, backgroundColor: bg }), [d, bg]);
  const labels = fieldLabels(d, p.state);
  const photo = p.photoUrl !== undefined ? p.photoUrl : d.stripImageUrl;
  const qrValue = p.qrValue || "APERCU-CARTE-FIDELITE";
  const name = p.businessName || "Nom du commerce";
  const { total, filled } = p.progress;
  const uid = `pv-${p.platform}`;

  const art = useMemo(() => {
    const progress = { total, filled };
    if (p.platform === "poster") return cardPosterSvg(design, 358, 448, uid, photo, progress);
    if (p.platform === "google") return cardBannerSvg(design, progress, "google", 1032, 336, uid, { decor: photo });
    return cardBannerSvg(design, progress, "apple", 375, 144, uid, { decor: photo });
  }, [p.platform, design, total, filled, uid, photo]);

  const fields: { label: string; value: string }[] = [{ label: labels.customer, value: p.customerName }];
  if (p.state.lap) fields.push({ label: "RECORD", value: p.state.lap });
  else if (p.secondary) fields.push(d.mode === "stamps" && labels.reward ? { ...p.secondary, label: labels.reward } : p.secondary);
  if (p.state.tier) fields.push({ label: "NIVEAU", value: p.state.tier.name });
  if (p.state.streak) fields.push({ label: "SÉRIE", value: `🔥 ${p.state.streak.count} sem.` });
  if (p.couponsCount) fields.push({ label: "OFFRES", value: `${p.couponsCount} disponible${p.couponsCount > 1 ? "s" : ""}` });

  if (p.platform === "poster") {
    // Même disposition que l'iPhone (iOS 27) : mêmes champs que la vraie carte.
    const { header, primary, footer } = posterFields(p.state, labels, p.customerName);
    return (
      <div className="w-full max-w-[340px]">
        <div className="text-xs font-semibold text-gray-500 mb-1">iPhone · iOS 27 (carte « poster »)</div>
        <div className="relative overflow-hidden rounded-[22px] shadow-xl" style={{ background: bg, color: d.foregroundColor, aspectRatio: "358 / 494" }}>
          <div className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: art }} />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3.5">
            <div className="flex items-center gap-2 min-w-0">
              {p.logoUrl && <img src={p.logoUrl} alt="" className="h-[30px] max-w-[126px] object-contain object-left" />}
              {(d.showLogoText || !p.logoUrl) && <span className="text-[17px] font-semibold truncate drop-shadow">{name}</span>}
            </div>
            <div className="text-right drop-shadow">
              <div className="text-[10px] font-bold tracking-wider" style={{ color: d.labelColor }}>{header.label}</div>
              <div className="text-[15px] font-semibold leading-tight">{header.value}</div>
            </div>
          </div>
          <div className="absolute inset-x-0 flex justify-center" style={{ top: "47%" }}>
            <div className="rounded-xl bg-white p-[2.2%] leading-none shadow-lg w-[34%] [&>svg]:w-full [&>svg]:h-auto">
              <QrSvg value={qrValue} size={112} />
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-3 backdrop-blur-md" style={{ background: `linear-gradient(to bottom, transparent, ${bg}cc 35%)` }}>
            <div className="flex items-end justify-between gap-2">
              {primary.map((f, i) => (
                <div key={f.label + i} className={`min-w-0 ${i === primary.length - 1 ? "text-right" : ""}`}>
                  <div className="text-[10px] font-semibold tracking-wider truncate" style={{ color: d.labelColor }}>{f.label}</div>
                  <div className={`${primary.length > 3 ? "text-[15px]" : "text-[17px]"} font-semibold leading-tight truncate tabular-nums`}>{f.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[12px] font-medium leading-snug line-clamp-2" style={{ color: d.stampColor }}>{footer}</div>
          </div>
        </div>
      </div>
    );
  }

  if (p.platform === "google") {
    return (
      <div className="w-full max-w-[340px]">
        <div className="text-xs font-semibold text-gray-500 mb-1">Android · Google Wallet</div>
        <div className="overflow-hidden rounded-[26px] shadow-xl" style={{ background: bg, color: d.foregroundColor }}>
          <div className="flex items-center gap-2.5 px-4 pt-4">
            <Logo url={p.logoUrl} name={name} bg={bg} fg={d.foregroundColor} round />
            <span className="text-sm font-medium truncate">{name}</span>
          </div>
          <div className="px-4 pt-3 text-[22px] leading-snug">{d.programName || "Carte de fidélité"}</div>
          <div className="grid grid-cols-2 gap-3 px-4 pt-3">
            <Field label={labels.balance} value={p.state.balanceValue} color={d.foregroundColor} big />
            {p.state.rank ? (
              <Field label="CLASSEMENT" value={`P${p.state.rank.pos} / ${p.state.rank.total}`} color={d.foregroundColor} align="right" big />
            ) : p.state.tier ? (
              <Field label="NIVEAU" value={p.state.tier.name} color={d.foregroundColor} align="right" big />
            ) : (
              <Field label={labels.customer} value={p.customerName} color={d.foregroundColor} align="right" big />
            )}
          </div>
          <div className="flex flex-col items-center py-4">
            <div className="rounded-2xl bg-white p-2.5 leading-none"><QrSvg value={qrValue} size={116} /></div>
            <div className="mt-1.5 text-xs opacity-80">{p.customerName}</div>
          </div>
          <Svg html={art} ratio="1032 / 336" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[340px]">
      <div className="text-xs font-semibold text-gray-500 mb-1">iPhone · iOS 26 et avant</div>
      <div className="overflow-hidden rounded-[14px] shadow-xl flex flex-col" style={{ background: bg, color: d.foregroundColor }}>
        <div className="flex items-center justify-between gap-2 px-3 h-[52px] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Logo url={p.logoUrl} name={name} bg={bg} fg={d.foregroundColor} />
            {d.showLogoText && <span className="font-semibold text-[15px] truncate">{name}</span>}
          </div>
          <div className="flex gap-4">
            {p.state.rank && <Field label="CLASSEMENT" value={`P${p.state.rank.pos}`} color={d.labelColor} align="right" />}
            <Field label={labels.balance} value={p.state.balanceValue} color={d.labelColor} align="right" />
          </div>
        </div>
        <Svg html={art} ratio="375 / 144" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 pt-3">
          {fields.slice(0, 4).map((f, i) => (
            <Field key={f.label + i} label={f.label} value={f.value} color={d.labelColor} align={i % 2 === 1 ? "right" : undefined} />
          ))}
        </div>
        <div className="flex flex-col items-center pb-4 pt-6">
          <div className="rounded-lg bg-white p-2 leading-none"><QrSvg value={qrValue} size={108} /></div>
          <div className="mt-1 text-[11px] opacity-80">{p.customerName}</div>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================
 *  Carte selon la disposition de l'éditeur (zones choisies + calques)
 * ====================================================================== */

/** Carte affichée : disposition de l'éditeur si elle existe, sinon l'affichage automatique d'avant. */
export default function CardPreview(p: PreviewProps) {
  if (p.slots) return <SlotCard {...p} slots={p.slots} />;
  return <LegacyCard {...p} />;
}

const SOURCE_LABEL: Record<string, string> = Object.fromEntries(SLOT_SOURCES.map((s) => [s.src, s.label]));

/** Petit champ de saisie posé directement sur la carte (même taille que le texte remplacé). */
function InlineInput({
  value,
  placeholder,
  onChange,
  className,
  style,
  maxLength,
  align,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  maxLength: number;
  align?: "right";
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      size={Math.max(4, (value || placeholder).length + 1)}
      className={`card-inline ${align === "right" ? "text-right" : ""} ${className ?? ""}`}
      style={style}
    />
  );
}

/** Zone cliquable (pointillés) en mode éditeur, simple bloc sinon. */
function Zone({
  id,
  name,
  ed,
  className,
  style,
  children,
}: {
  id: string;
  name: string;
  ed?: CardEditorHooks;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (!ed) return <div className={className} style={style}>{children}</div>;
  const on = ed.selected === id;
  return (
    <div
      data-zone={id}
      role="button"
      tabIndex={0}
      aria-label={`Modifier : ${name}`}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        ed.onSelect(id);
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement).tagName !== "INPUT") {
          e.preventDefault();
          ed.onSelect(id);
        }
      }}
      className={`card-zone ${on ? "card-zone-on" : ""} ${className ?? ""}`}
      style={style}
    >
      {on && <span className="card-zone-chip">{name}</span>}
      {children}
    </div>
  );
}

const ZONE_NAMES: Record<string, string> = {
  top: "En haut à droite",
  b1: "Champ 1",
  b2: "Champ 2",
  b3: "Champ 3",
  b4: "Champ 4",
  foot: "Ligne du bas",
  logo: "Logo et nom",
  qr: "QR code",
  title: "Nom de la carte",
};

/** Un champ (petit titre + valeur) dans une zone. */
function SlotField({
  zone,
  field,
  labelColor,
  align,
  size = "md",
  ed,
}: {
  zone: FieldSlot;
  field: CardField | null;
  labelColor: string;
  align?: "right";
  size?: "md" | "lg";
  ed?: CardEditorHooks;
}) {
  const cfg = ed?.slotConfigs?.[zone];
  const on = ed?.selected === zone;
  if (!ed && !field) return null;
  const valueCls = `${size === "lg" ? "text-[17px] font-semibold" : "text-[14px]"} leading-tight truncate tabular-nums`;
  let content: React.ReactNode;
  if (on && ed) {
    content = (
      <>
        <div className="text-[10px] font-semibold tracking-wider" style={{ color: labelColor }}>
          <InlineInput
            value={cfg?.label ?? ""}
            placeholder={field?.label || (cfg?.src === "custom" ? "TITRE" : "")}
            onChange={(v) => ed.onSlotLabel(zone, v)}
            maxLength={20}
            align={align}
            className="uppercase tracking-wider font-semibold"
          />
        </div>
        {cfg?.src === "custom" ? (
          <InlineInput
            value={cfg.value ?? ""}
            placeholder="Ton texte"
            onChange={(v) => ed.onSlotValue(zone, v)}
            maxLength={40}
            align={align}
            className={valueCls}
          />
        ) : (
          <div className={valueCls}>{field?.value ?? "—"}</div>
        )}
      </>
    );
  } else if (field) {
    content = (
      <>
        <div className="text-[10px] font-semibold tracking-wider truncate" style={{ color: labelColor }}>{field.label}</div>
        <div className={valueCls}>{field.value}</div>
      </>
    );
  } else {
    const src = cfg?.src ?? "none";
    content = (
      <div className="card-empty">
        {src === "none" ? "+ vide" : `${SOURCE_LABEL[src] ?? src} (absent ici)`}
      </div>
    );
  }
  return (
    <Zone id={zone} name={ZONE_NAMES[zone]} ed={ed} className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      {content}
    </Zone>
  );
}

/** Calques (textes, stickers) et bande de tampons, déplaçables à la souris ou au doigt. */
function ArtOverlay({
  format,
  layers,
  options,
  ed,
}: {
  format: ArtFormat;
  layers: CardLayout["layers"];
  options: BannerOptions;
  ed: CardEditorHooks;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const { w: W, h: H } = FORMATS[format];
  const band = stampsBox(options, format);
  const toPoint = (e: { clientX: number; clientY: number }) => {
    const svg = ref.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  };
  const drag = (e: React.PointerEvent, onMove: (p: { x: number; y: number }) => void) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as Element;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {}
    const move = (ev: Event) => onMove(toPoint(ev as PointerEvent));
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
  const u = Math.min(W, H) / 100; // unité des poignées
  return (
    <svg
      ref={ref}
      className="absolute inset-0 h-full w-full touch-none"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-label="Photo de la carte : clique pour la modifier, fais glisser les textes et stickers"
      onClick={(e) => e.stopPropagation()}
    >
      <rect
        width={W}
        height={H}
        fill="transparent"
        onPointerDown={(e) => {
          e.stopPropagation();
          ed.onSelect("photo");
        }}
        className="cursor-pointer"
      />
      {ed.selected === "photo" && (
        <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke="#ff5b1f" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
      {band && (
        <rect
          x={band.x - 2}
          y={band.y - 2}
          width={band.w + 4}
          height={band.h + 4}
          rx={6}
          fill="transparent"
          stroke={ed.selected === "stamps" ? "#ff5b1f" : "#ffffff"}
          strokeOpacity={ed.selected === "stamps" ? 1 : 0.75}
          strokeDasharray={ed.selected === "stamps" ? undefined : "4 3"}
          strokeWidth={ed.selected === "stamps" ? 2 : 1.2}
          vectorEffect="non-scaling-stroke"
          className="cursor-ns-resize"
          onPointerDown={(e) => {
            ed.onSelect("stamps");
            const p0 = toPoint(e);
            const c0 = band.y + band.h / 2;
            drag(e, (p) => ed.onStampsMove(Math.min(0.97, Math.max(0.03, (c0 + p.y - p0.y) / H)), format));
          }}
        />
      )}
      {layers.map((l) => {
        const box = layerBox(l, format, W, H);
        const on = ed.selected === `layer:${l.id}`;
        const pos = { x: box.cx, y: box.cy };
        return (
          <g key={l.id}>
            <g dangerouslySetInnerHTML={{ __html: layerSvg(l, format, W, H) }} style={{ pointerEvents: "none" }} />
            <g transform={`rotate(${box.rot} ${box.cx} ${box.cy})`}>
              <rect
                x={box.cx - box.w / 2}
                y={box.cy - box.h / 2}
                width={box.w}
                height={box.h}
                fill="transparent"
                stroke={on ? "#ff5b1f" : "#ffffff"}
                strokeOpacity={on ? 1 : 0.6}
                strokeDasharray={on ? undefined : "4 3"}
                strokeWidth={on ? 1.8 : 1}
                vectorEffect="non-scaling-stroke"
                className="cursor-move"
                onPointerDown={(e) => {
                  ed.onSelect(`layer:${l.id}`);
                  const p0 = toPoint(e);
                  drag(e, (p) => ed.onLayerChange(l.id, { x: (pos.x + p.x - p0.x) / W, y: (pos.y + p.y - p0.y) / H }, format));
                }}
              />
              {on && (
                <>
                  {/* Agrandir / réduire */}
                  <circle
                    cx={box.cx + box.w / 2}
                    cy={box.cy + box.h / 2}
                    r={3.2 * u}
                    fill="#ffffff"
                    stroke="#ff5b1f"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-nwse-resize"
                    onPointerDown={(e) => {
                      const p0 = toPoint(e);
                      const d0 = Math.hypot(p0.x - box.cx, p0.y - box.cy) || 1;
                      const fmtSize = (format === "poster" ? l.size : (l.at?.[format]?.size ?? l.size));
                      drag(e, (p) => {
                        const d = Math.hypot(p.x - box.cx, p.y - box.cy);
                        ed.onLayerChange(l.id, { size: Math.min(80, Math.max(2, (fmtSize * d) / d0)) }, format);
                      });
                    }}
                  />
                  {/* Tourner */}
                  <line x1={box.cx} y1={box.cy - box.h / 2} x2={box.cx} y2={box.cy - box.h / 2 - 7 * u} stroke="#ff5b1f" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  <circle
                    cx={box.cx}
                    cy={box.cy - box.h / 2 - 7 * u}
                    r={3.2 * u}
                    fill="#ff5b1f"
                    stroke="#ffffff"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-grab"
                    onPointerDown={(e) =>
                      drag(e, (p) => {
                        let deg = (Math.atan2(p.y - box.cy, p.x - box.cx) * 180) / Math.PI + 90;
                        if (deg > 180) deg -= 360;
                        if (Math.abs(deg) < 4) deg = 0;
                        ed.onLayerChange(l.id, { rot: Math.round(deg) }, format);
                      })
                    }
                  />
                </>
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function SlotCard(p: PreviewProps & { slots: ResolvedSlots }) {
  const d = p.design;
  const ed = p.editor;
  const bg = p.state.tier?.color || d.backgroundColor;
  const fmt: ArtFormat = p.platform === "poster" ? "poster" : p.platform === "google" ? "google" : "apple";
  // En mode éditeur, les calques sont dessinés par la couche interactive (au-dessus)
  const design = useMemo(
    () => ({ ...d, backgroundColor: bg, layout: ed ? { ...d.layout, layers: [] } : d.layout }),
    [d, bg, ed],
  );
  const photo = p.photoUrl !== undefined ? p.photoUrl : d.stripImageUrl;
  const qrValue = p.qrValue || "APERCU-CARTE-FIDELITE";
  const name = p.businessName || "Nom du commerce";
  const { total, filled } = p.progress;
  const uid = `sv-${p.platform}`;
  const art = useMemo(() => {
    const progress = { total, filled };
    if (p.platform === "poster") return cardPosterSvg(design, 358, 448, uid, photo, progress);
    if (p.platform === "google") return cardBannerSvg(design, progress, "google", 1032, 336, uid, { decor: photo });
    return cardBannerSvg(design, progress, "apple", 375, 144, uid, { decor: photo });
  }, [p.platform, design, total, filled, uid, photo]);
  const options = useMemo(() => bannerOptions({ ...d, backgroundColor: bg }, { total, filled }, photo, fmt), [d, bg, total, filled, photo, fmt]);
  const { top, bottom, footer } = p.slots;
  const overlay = ed ? <ArtOverlay format={fmt} layers={d.layout.layers} options={options} ed={ed} /> : null;
  const deselect = ed ? () => ed.onSelect(null) : undefined;
  const nameNode =
    ed && ed.selected === "logo" ? (
      <InlineInput value={p.businessName} placeholder="Nom du commerce" onChange={ed.onName} maxLength={60} className="font-semibold" />
    ) : (
      name
    );

  if (p.platform === "poster") {
    const shown = ed ? (["b1", "b2", "b3", "b4"] as const) : (["b1", "b2", "b3", "b4"] as const).filter((_, i) => bottom[i]);
    const lastShown = shown[shown.length - 1];
    return (
      <div className="w-full max-w-[340px]" onClick={deselect}>
        <div className="relative overflow-hidden rounded-[22px] shadow-xl" style={{ background: bg, color: d.foregroundColor, aspectRatio: "358 / 494" }}>
          <div className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: art }} />
          {overlay}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3.5">
            <Zone id="logo" name={ZONE_NAMES.logo} ed={ed} className="pointer-events-auto flex items-center gap-2 min-w-0">
              {p.logoUrl && <img src={p.logoUrl} alt="" className="h-[30px] max-w-[126px] object-contain object-left" />}
              {(d.showLogoText || !p.logoUrl) && <span className="text-[17px] font-semibold truncate drop-shadow">{nameNode}</span>}
            </Zone>
            <div className="pointer-events-auto drop-shadow">
              <SlotField zone="top" field={top} labelColor={d.labelColor} align="right" size="lg" ed={ed} />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: "47%" }}>
            <Zone id="qr" name={ZONE_NAMES.qr} ed={ed} className="pointer-events-auto rounded-xl bg-white p-[2.2%] leading-none shadow-lg w-[34%] [&_svg]:w-full [&_svg]:h-auto">
              <QrSvg value={qrValue} size={112} />
            </Zone>
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-3 pt-3"
            style={{ background: `linear-gradient(to bottom, transparent, ${bg}cc 35%)` }}
          >
            <div className="flex items-end justify-between gap-2">
              {shown.map((z) => (
                <div key={z} className={`pointer-events-auto min-w-0 ${bottom[Number(z[1]) - 1] ? "flex-1" : "flex-none"}`}>
                  <SlotField zone={z} field={bottom[Number(z[1]) - 1]} labelColor={d.labelColor} align={z === lastShown && shown.length > 1 ? "right" : undefined} size="lg" ed={ed} />
                </div>
              ))}
            </div>
            {(footer || ed) && (
              <Zone id="foot" name={ZONE_NAMES.foot} ed={ed} className="pointer-events-auto mt-2 text-[12px] font-medium leading-snug line-clamp-2">
                {ed && ed.selected === "foot" && ed.slotConfigs?.foot?.src === "custom" ? (
                  <InlineInput value={ed.slotConfigs.foot.value ?? ""} placeholder="Ton message" onChange={(v) => ed.onSlotValue("foot", v)} maxLength={90} style={{ color: d.stampColor }} />
                ) : (
                  <span style={{ color: d.stampColor }}>{footer || <span className="card-empty">+ vide</span>}</span>
                )}
              </Zone>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (p.platform === "google") {
    const rightIdx = bottom.findIndex((f) => f !== null);
    const rightZone = (["b1", "b2", "b3", "b4"] as const)[rightIdx >= 0 ? rightIdx : 0];
    return (
      <div className="w-full max-w-[340px]" onClick={deselect}>
        <div className="overflow-hidden rounded-[26px] shadow-xl" style={{ background: bg, color: d.foregroundColor }}>
          <Zone id="logo" name={ZONE_NAMES.logo} ed={ed} className="flex items-center gap-2.5 px-4 pt-4">
            <Logo url={p.logoUrl} name={name} bg={bg} fg={d.foregroundColor} round />
            <span className="text-sm font-medium truncate">{nameNode}</span>
          </Zone>
          <Zone id="title" name={ZONE_NAMES.title} ed={ed} className="mx-4 mt-3 text-[22px] leading-snug">
            {ed && ed.selected === "title" ? (
              <InlineInput value={d.programName} placeholder="Carte de fidélité" onChange={ed.onProgramName} maxLength={40} />
            ) : (
              d.programName || "Carte de fidélité"
            )}
          </Zone>
          <div className="grid grid-cols-2 gap-3 px-4 pt-3">
            <SlotField zone="top" field={top ?? { key: "x", label: fieldLabels(d, p.state).balance, value: p.state.balanceValue }} labelColor={d.foregroundColor} size="lg" ed={ed} />
            <SlotField zone={rightZone} field={rightIdx >= 0 ? bottom[rightIdx] : null} labelColor={d.foregroundColor} align="right" size="lg" ed={ed} />
          </div>
          <div className="flex flex-col items-center py-4">
            <Zone id="qr" name={ZONE_NAMES.qr} ed={ed} className="rounded-2xl bg-white p-2.5 leading-none">
              <QrSvg value={qrValue} size={116} />
            </Zone>
            <div className="mt-1.5 text-xs opacity-80">{p.customerName}</div>
          </div>
          <div className="relative w-full" style={{ aspectRatio: "1032 / 336" }}>
            <div className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: art }} />
            {overlay}
          </div>
        </div>
      </div>
    );
  }

  const shownApple = (["b1", "b2", "b3", "b4"] as const).filter((_, i) => ed || bottom[i]);
  return (
    <div className="w-full max-w-[340px]" onClick={deselect}>
      <div className="overflow-hidden rounded-[14px] shadow-xl flex flex-col" style={{ background: bg, color: d.foregroundColor }}>
        <div className="flex items-center justify-between gap-2 px-3 h-[52px] shrink-0">
          <Zone id="logo" name={ZONE_NAMES.logo} ed={ed} className="flex items-center gap-2 min-w-0">
            <Logo url={p.logoUrl} name={name} bg={bg} fg={d.foregroundColor} />
            {d.showLogoText && <span className="font-semibold text-[15px] truncate">{nameNode}</span>}
          </Zone>
          <SlotField zone="top" field={top} labelColor={d.labelColor} align="right" ed={ed} />
        </div>
        <div className="relative w-full" style={{ aspectRatio: "375 / 144" }}>
          <div className="absolute inset-0 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: art }} />
          {overlay}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 pt-3">
          {shownApple.map((z, i) => (
            <SlotField key={z} zone={z} field={bottom[Number(z[1]) - 1]} labelColor={d.labelColor} align={i % 2 === 1 ? "right" : undefined} ed={ed} />
          ))}
        </div>
        <div className="flex flex-col items-center pb-4 pt-6">
          <Zone id="qr" name={ZONE_NAMES.qr} ed={ed} className="rounded-lg bg-white p-2 leading-none">
            <QrSvg value={qrValue} size={108} />
          </Zone>
          <div className="mt-1 text-[11px] opacity-80">{p.customerName}</div>
        </div>
      </div>
    </div>
  );
}
