"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo } from "react";
import QRCode from "qrcode";
import { cardBannerSvg, cardPosterSvg, fieldLabels, posterFields, type CardDesign, type CardState } from "@/lib/card-state";

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

export default function CardPreview(p: PreviewProps) {
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
