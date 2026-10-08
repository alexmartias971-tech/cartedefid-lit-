"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import {
  autoSlots,
  bannerOptions,
  cardBannerSvg,
  cardPosterSvg,
  fieldLabels,
  googleFields,
  isLegacyLayout,
  type CardDesign,
  type CardState,
  type Field as CardField,
  type ResolvedSlots,
} from "@/lib/card-state";
import { coverRect, FORMATS, layerBox, layerSvg, stampsBox, type BannerFormat, type BannerOptions, type LogoArt } from "@/lib/visual";
import type { ArtFormat, CardLayout, Crop } from "@/lib/layout";
import { useImageRatio } from "@/lib/use-image-ratio";

/**
 * Aperçu fidèle de la carte dans le Wallet, aux formats officiels (vérifiés en octobre 2026) :
 *  - "poster" : iPhone iOS 27, style « Poster Generic » : photo sur toute la carte (artwork 358 × 448 pt),
 *               petit logo (primaryLogo, sans texte à côté : sans logo, le nom est écrit en image), 1 champ en haut
 *               à droite, QR code, 4 champs et 1 ligne en bas.
 *  - "apple"  : iPhone iOS 26 et avant, style « storeCard » : logo + nom + champ d'en-tête, bannière 375 × 144 pt,
 *               UNE ligne de 4 champs au maximum, puis le QR code.
 *  - "google" : Android : logo rond + nom en haut à gauche (ou logo large qui remplace les deux), titre, QR code,
 *               2 compteurs, puis l'image héros (≈ 5:4) en bas.
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
  /** Photo à afficher pour ce téléphone (celle du niveau, le visuel propre au format ou la photo principale). */
  photoUrl?: string | null;
  /** Progression dessinée (cases remplies / total). */
  progress: { total: number; filled: number; streak?: { count: number; goal: number } | null };
  /** Gardés pour compatibilité (anciens appels). */
  secondary?: { label: string; value: string } | null;
  couponsCount?: number;
  /** Contenu du QR code (numéro de la carte). */
  qrValue?: string;
  /** Zones remplies selon la disposition de l'éditeur (sinon : disposition automatique). */
  slots?: ResolvedSlots | null;
  /** Mode éditeur : zones cliquables, calques déplaçables, photo recadrable. */
  editor?: CardEditorHooks;
  /** Montre le cadre de chaque zone (survol) : désactivé pour les petites vignettes. */
  compact?: boolean;
};

export type CardEditorHooks = {
  selected: string | null;
  onSelect: (zone: string | null) => void;
  onLayerChange: (id: string, change: { x?: number; y?: number; size?: number; rot?: number }, format: ArtFormat) => void;
  onStampsMove: (y: number, format: ArtFormat) => void;
  /** Recadrage de la photo au doigt (outil « Fond »). */
  panPhoto?: boolean;
  onCropChange?: (format: ArtFormat, crop: Crop) => void;
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

function FieldView({ f, labelColor, align, size = "md" }: { f: CardField; labelColor: string; align?: "right" | "center"; size?: "sm" | "md" | "lg" }) {
  const v = size === "lg" ? "text-[17px] font-semibold" : size === "sm" ? "text-[12.5px] font-medium" : "text-[14px] font-medium";
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider" style={{ color: labelColor }}>{f.label}</div>
      <div className={`${v} truncate leading-tight tabular-nums`}>{f.value}</div>
    </div>
  );
}

/** Zone cliquable en mode éditeur (cadre au survol), simple bloc sinon. */
function Zone({ id, label, ed, className, style, children }: { id: string; label: string; ed?: CardEditorHooks; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  if (!ed) return <div className={className} style={style}>{children}</div>;
  const on = ed.selected === id;
  return (
    <div
      data-zone={id}
      role="button"
      tabIndex={0}
      aria-label={`Modifier : ${label}`}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        ed.onSelect(id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ed.onSelect(id);
        }
      }}
      className={`card-zone ${on ? "card-zone-on" : ""} ${className ?? ""}`}
      style={style}
    >
      {on && <span className="card-zone-chip">{label}</span>}
      {children}
    </div>
  );
}

const Art = ({ html, className = "absolute inset-0" }: { html: string; className?: string }) => (
  <div className={`${className} [&>svg]:h-full [&>svg]:w-full`} dangerouslySetInnerHTML={{ __html: html }} />
);

/** Calques (textes, stickers, logo, mascotte), bande de tampons et recadrage de la photo, au doigt ou à la souris. */
function ArtOverlay({
  format,
  layers,
  options,
  logo,
  ed,
  legacyArt = false,
  dims,
}: {
  format: ArtFormat;
  layers: CardLayout["layers"];
  options: BannerOptions;
  logo: LogoArt | null;
  ed: CardEditorHooks;
  /** Ancien style dessiné en bandeau : ni bande de tampons à glisser, ni recadrage (le dessin ne les utilise pas). */
  legacyArt?: boolean;
  /** Taille du dessin si elle diffère du format (ancien bandeau Android 3:1). */
  dims?: { w: number; h: number };
}) {
  const ref = useRef<SVGSVGElement>(null);
  /** Dernier appui au doigt ? (au doigt, un simple toucher sélectionne et glisser fait défiler la page) */
  const touch = useRef(false);
  const { w: W, h: H } = dims ?? FORMATS[format];
  const band = legacyArt ? null : stampsBox(options, format);
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
  // Au doigt (écran tactile), des poignées plus grandes
  const coarse = useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(pointer: coarse)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
  const u = (Math.min(W, H) / 100) * (coarse ? 1.6 : 1);
  const canPan = !legacyArt && !!(ed.panPhoto && options.photo && options.photoRatio && ed.onCropChange);
  return (
    <svg
      ref={ref}
      className={`absolute inset-0 h-full w-full ${ed.selected ? "touch-none" : ""}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-label="Visuel de la carte"
      onClick={(e) => e.stopPropagation()}
    >
      <rect
        width={W}
        height={H}
        fill="transparent"
        className={canPan ? "cursor-grab" : "cursor-pointer"}
        onPointerDown={(e) => {
          e.stopPropagation();
          touch.current = e.pointerType === "touch";
          // Au doigt : sélection au relâcher (voir onClick), sauf pour recadrer la photo déjà sélectionnée
          if (touch.current && !(canPan && ed.selected === "photo")) return;
          ed.onSelect("photo");
          if (!canPan) return;
          // Glisser = déplacer la photo dans le cadre (le zoom se règle dans le panneau)
          const crop = options.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
          const r = coverRect(options.photoRatio!, W, H, crop);
          const p0 = toPoint(e);
          drag(e, (p) => {
            const nx = r.w - W > 0.5 ? crop.x - (p.x - p0.x) / (r.w - W) : crop.x;
            const ny = r.h - H > 0.5 ? crop.y - (p.y - p0.y) / (r.h - H) : crop.y;
            ed.onCropChange!(format, { x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)), zoom: crop.zoom });
          });
        }}
        onClick={() => touch.current && ed.selected !== "photo" && ed.onSelect("photo")}
      />
      {ed.selected === "photo" && (
        <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke="#ff5b1f" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      )}
      {band && (
        <rect
          x={band.x - 2}
          y={band.y - 2}
          width={band.w + 4}
          height={band.h + 4}
          rx={6}
          fill="transparent"
          stroke={ed.selected === "stamps" ? "#ff5b1f" : "transparent"}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          className="card-band cursor-ns-resize"
          onPointerDown={(e) => {
            touch.current = e.pointerType === "touch";
            if (touch.current && ed.selected !== "stamps") return;
            ed.onSelect("stamps");
            const p0 = toPoint(e);
            const c0 = band.y + band.h / 2;
            drag(e, (p) => ed.onStampsMove(Math.min(0.97, Math.max(0.03, (c0 + p.y - p0.y) / H)), format));
          }}
          onClick={() => touch.current && ed.selected !== "stamps" && ed.onSelect("stamps")}
        />
      )}
      {layers.map((l) => {
        const ctx = { logo, uid: "ed" };
        const box = layerBox(l, format, W, H, ctx);
        const on = ed.selected === `layer:${l.id}`;
        const pos = { x: box.cx, y: box.cy };
        const size0 = format === "poster" ? l.size : (l.at?.[format]?.size ?? l.size);
        return (
          <g key={l.id}>
            <g dangerouslySetInnerHTML={{ __html: layerSvg(l, format, W, H, ctx) }} style={{ pointerEvents: "none" }} />
            <g transform={`rotate(${box.rot} ${box.cx} ${box.cy})`}>
              <rect
                x={box.cx - box.w / 2}
                y={box.cy - box.h / 2}
                width={box.w}
                height={box.h}
                fill="transparent"
                stroke={on ? "#ff5b1f" : "transparent"}
                strokeWidth={1.8}
                vectorEffect="non-scaling-stroke"
                className="card-layer cursor-move"
                onPointerDown={(e) => {
                  touch.current = e.pointerType === "touch";
                  if (touch.current && !on) return;
                  ed.onSelect(`layer:${l.id}`);
                  const p0 = toPoint(e);
                  drag(e, (p) => ed.onLayerChange(l.id, { x: (pos.x + p.x - p0.x) / W, y: (pos.y + p.y - p0.y) / H }, format));
                }}
                onClick={() => touch.current && !on && ed.onSelect(`layer:${l.id}`)}
              />
              {on && (
                <>
                  <circle
                    cx={box.cx + box.w / 2}
                    cy={box.cy + box.h / 2}
                    r={3.4 * u}
                    fill="#ffffff"
                    stroke="#ff5b1f"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-nwse-resize"
                    aria-label="Agrandir ou réduire"
                    onPointerDown={(e) => {
                      const p0 = toPoint(e);
                      const d0 = Math.hypot(p0.x - box.cx, p0.y - box.cy) || 1;
                      drag(e, (p) => {
                        const d = Math.hypot(p.x - box.cx, p.y - box.cy);
                        ed.onLayerChange(l.id, { size: Math.min(100, Math.max(2, (size0 * d) / d0)) }, format);
                      });
                    }}
                  />
                  {l.kind !== "logo" && <line x1={box.cx} y1={box.cy - box.h / 2} x2={box.cx} y2={box.cy - box.h / 2 - 7 * u} stroke="#ff5b1f" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
                  {l.kind !== "logo" && <circle
                    cx={box.cx}
                    cy={box.cy - box.h / 2 - 7 * u}
                    r={3.4 * u}
                    fill="#ff5b1f"
                    stroke="#ffffff"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-grab"
                    aria-label="Tourner"
                    onPointerDown={(e) =>
                      drag(e, (p) => {
                        let deg = (Math.atan2(p.y - box.cy, p.x - box.cx) * 180) / Math.PI + 90;
                        if (deg > 180) deg -= 360;
                        if (Math.abs(deg) < 4) deg = 0;
                        ed.onLayerChange(l.id, { rot: Math.round(deg) }, format);
                      })
                    }
                  />}
                </>
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** Carte affichée : celle de l'éditeur (zones choisies) ou la disposition automatique. */
export default function CardPreview(p: PreviewProps) {
  const d = p.design;
  const ed = p.editor;
  const fmt: ArtFormat = p.platform;
  const bg = p.state.tier?.color || d.backgroundColor;
  const photo = p.photoUrl !== undefined ? p.photoUrl : d.stripImageUrl;
  const logoRatio = useImageRatio(p.logoUrl);
  const photoRatio = useImageRatio(photo);
  const logo: LogoArt | null = p.logoUrl && logoRatio ? { href: p.logoUrl, ratio: logoRatio } : null;
  const slots = p.slots ?? autoSlots(d, p.state, p.customerName);
  const name = p.businessName || "Nom du commerce";
  const qrValue = p.qrValue || "APERCU-CARTE-FIDELITE";
  const topLogo = !!p.logoUrl && d.layout?.topLogo !== false;
  const showName = d.showLogoText || !topLogo;
  const { total, filled } = p.progress;
  const streak = p.progress.streak ?? null;

  // En mode éditeur, les calques sont dessinés par la couche interactive (au-dessus) : on les retire du dessin de fond
  const drawDesign = useMemo(
    () => ({ ...d, backgroundColor: bg, layout: ed ? { ...d.layout, layers: [] } : d.layout }),
    [d, bg, ed],
  );
  const uid = `cv-${p.platform}-${ed ? "e" : "v"}`;
  // Ancien style dessiné (grille, collection, remplissage) : bandeau, ni bande de tampons à glisser, ni recadrage
  const legacyArt = fmt !== "poster" && d.mode !== "cashback" && !["glass", "minimal", "track", "none"].includes(d.progressStyle);
  // L'image Android garde l'ancien bandeau 3:1 pour un ancien style dessiné, et pour une carte pas encore enregistrée
  // avec l'éditeur v2 (hors éditeur : dans l'éditeur, on montre déjà ce que donnera l'enregistrement), comme sur les téléphones
  const artFmt: BannerFormat | "poster" = fmt === "google" && (legacyArt || (!ed && isLegacyLayout(d.layout))) ? "googleLegacy" : fmt;
  const assets = useMemo(() => ({ logo, photoRatio }), [logo?.href, logo?.ratio, photoRatio]); // eslint-disable-line react-hooks/exhaustive-deps
  const art = useMemo(() => {
    const progress = { total, filled, streak };
    const { w, h } = FORMATS[artFmt];
    if (artFmt === "poster") return cardPosterSvg(drawDesign, w, h, uid, photo, progress, assets);
    return cardBannerSvg(drawDesign, progress, artFmt, w, h, uid, { decor: photo, ...assets });
  }, [artFmt, drawDesign, total, filled, streak, uid, photo, assets]);
  const options = useMemo(
    () => bannerOptions({ ...d, backgroundColor: bg }, { total, filled, streak }, photo, fmt, assets),
    [d, bg, total, filled, streak, photo, fmt, assets],
  );
  const overlay = ed ? <ArtOverlay format={fmt} dims={FORMATS[artFmt]} layers={d.layout.layers} options={options} logo={logo} ed={ed} legacyArt={legacyArt} /> : null;
  const deselect = ed ? () => ed.onSelect(null) : undefined;
  const fields = slots.bottom.filter((f): f is CardField => f !== null);
  const cls = `card-preview w-full ${p.compact ? "card-compact" : ""}`;

  if (fmt === "poster") {
    return (
      <div className={`${cls} max-w-[340px]`} onClick={deselect}>
        <div className="relative overflow-hidden rounded-[22px] shadow-xl" style={{ background: bg, color: d.foregroundColor, aspectRatio: "358 / 494" }}>
          <Art html={art} />
          {overlay}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3.5">
            <Zone id="logo" label="Logo et nom" ed={ed} className="pointer-events-auto flex min-h-[30px] min-w-0 items-center gap-2">
              {/* iOS 27 : jamais de texte à côté du logo ; sans logo, le nom est envoyé en image (même rendu) */}
              {topLogo ? (
                <img src={p.logoUrl!} alt="" className="h-[30px] max-w-[126px] object-contain object-left" />
              ) : showName ? (
                <span className="max-w-[126px] truncate text-[19px] font-semibold leading-[30px] drop-shadow">{name}</span>
              ) : null}
            </Zone>
            {slots.top && (
              <Zone id="infos" label="Infos" ed={ed} className="pointer-events-auto drop-shadow">
                <FieldView f={slots.top} labelColor={d.labelColor} align="right" size="lg" />
              </Zone>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: "47%" }}>
            <Zone id="qr" label="QR code" ed={ed} className="pointer-events-auto w-[34%] rounded-xl bg-white p-[2.2%] leading-none shadow-lg [&_svg]:h-auto [&_svg]:w-full">
              <QrSvg value={qrValue} size={112} />
            </Zone>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-3 pt-3" style={{ background: `linear-gradient(to bottom, transparent, ${bg}cc 35%)` }}>
            {fields.length > 0 && (
              <Zone id="infos" label="Infos" ed={ed} className="pointer-events-auto flex items-end justify-between gap-3">
                {fields.map((f, i) => (
                  <div key={f.key + i} className={i === fields.length - 1 && fields.length > 1 ? "min-w-0 text-right" : "min-w-0 flex-1"}>
                    <FieldView f={f} labelColor={d.labelColor} align={i === fields.length - 1 && fields.length > 1 ? "right" : undefined} size={fields.length > 3 ? "md" : "lg"} />
                  </div>
                ))}
              </Zone>
            )}
            {slots.footer && (
              <Zone id="message" label="Message du bas" ed={ed} className="pointer-events-auto mt-2 line-clamp-1 text-[12px] font-medium leading-snug">
                <span style={{ color: d.foregroundColor, opacity: 0.86 }}>{slots.footer}</span>
              </Zone>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (fmt === "google") {
    const wide = !!p.logoUrl && !d.showLogoText;
    const gf = googleFields(p.state, d.mode, fieldLabels(d, p.state).balance, p.couponsCount ?? 0);
    const left = { key: "gl", ...gf.left };
    const right = gf.right ? { key: "gr", ...gf.right } : null;
    const { w, h } = FORMATS[artFmt === "googleLegacy" ? "googleLegacy" : "google"];
    return (
      <div className={`${cls} max-w-[340px]`} onClick={deselect}>
        <div className="overflow-hidden rounded-[26px] shadow-xl" style={{ background: bg, color: d.foregroundColor }}>
          <Zone id="logo" label="Logo et nom" ed={ed} className="mx-4 mt-4 flex min-h-[40px] items-center gap-2.5">
            {wide ? (
              <img src={p.logoUrl!} alt="" className="h-[40px] max-w-[220px] object-contain object-left" />
            ) : (
              <>
                {p.logoUrl ? (
                  <img src={p.logoUrl} alt="" className="h-10 w-10 flex-none rounded-full object-contain p-1" style={{ background: bg, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)" }} />
                ) : (
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full text-lg font-bold" style={{ background: d.foregroundColor, color: bg }}>
                    {(name.trim()[0] ?? "?").toUpperCase()}
                  </span>
                )}
                <span className="truncate text-[14px] font-medium opacity-90">{name.slice(0, 20)}</span>
              </>
            )}
          </Zone>
          <Zone id="title" label="Titre de la carte" ed={ed} className="mx-4 mt-2.5 text-[21px] leading-snug">
            {d.programName || "Carte de fidélité"}
          </Zone>
          <div className="flex flex-col items-center pt-4">
            <Zone id="qr" label="QR code" ed={ed} className="rounded-2xl bg-white p-2.5 leading-none">
              <QrSvg value={qrValue} size={112} />
            </Zone>
          </div>
          <Zone id="infos" label="Infos" ed={ed} className="mx-4 mt-3 grid grid-cols-2 gap-3 pb-4">
            <FieldView f={left} labelColor={d.foregroundColor} />
            {right ? <FieldView f={right} labelColor={d.foregroundColor} align="right" /> : <span />}
          </Zone>
          <div className="relative w-full" style={{ aspectRatio: `${w} / ${h}` }}>
            <Art html={art} />
            {overlay}
          </div>
        </div>
      </div>
    );
  }

  // iPhone iOS 26 et avant (storeCard)
  const { w, h } = FORMATS.apple;
  const drawsCells = d.mode !== "cashback" && d.progressStyle !== "none";
  const row = fields.slice(0, 4);
  return (
    <div className={`${cls} max-w-[340px]`} onClick={deselect}>
      <div className="flex flex-col overflow-hidden rounded-[14px] shadow-xl" style={{ background: bg, color: d.foregroundColor }}>
        <div className="flex h-[54px] shrink-0 items-center justify-between gap-2 px-3">
          <Zone id="logo" label="Logo et nom" ed={ed} className="flex min-h-[30px] min-w-0 items-center gap-2">
            {topLogo && <img src={p.logoUrl!} alt="" className="h-[40px] max-w-[130px] object-contain object-left" />}
            {showName && <span className="truncate text-[15px] font-semibold">{name}</span>}
          </Zone>
          {slots.top && (
            <Zone id="infos" label="Infos" ed={ed}>
              <FieldView f={slots.top} labelColor={d.labelColor} align="right" />
            </Zone>
          )}
        </div>
        <div className="relative w-full" style={{ aspectRatio: `${w} / ${h}` }}>
          <Art html={art} />
          {overlay}
          {!drawsCells && (
            <div className="pointer-events-none absolute bottom-3 left-4 drop-shadow">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: d.labelColor }}>{fieldLabels(d, p.state).balance}</div>
              <div className="text-[30px] font-semibold leading-none">{p.state.balanceValue}</div>
            </div>
          )}
        </div>
        {row.length > 0 && (
          <Zone id="infos" label="Infos" ed={ed} className="mx-3 mt-2.5 grid gap-3" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
            {row.map((f, i) => (
              <FieldView key={f.key + i} f={f} labelColor={d.labelColor} size={row.length > 2 ? "sm" : "md"} align={i === row.length - 1 && row.length > 1 ? "right" : undefined} />
            ))}
          </Zone>
        )}
        <div className="flex flex-col items-center pb-4 pt-5">
          <Zone id="qr" label="QR code" ed={ed} className="rounded-lg bg-white p-2 leading-none">
            <QrSvg value={qrValue} size={104} />
          </Zone>
        </div>
      </div>
    </div>
  );
}
