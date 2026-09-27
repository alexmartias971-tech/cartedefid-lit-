/* eslint-disable @next/next/no-img-element */
import type { CardState } from "@/lib/card-state";

/**
 * Aperçu de la carte telle qu'elle apparaît dans le Wallet.
 * La disposition suit celle d'Apple Wallet (en-tête, bannière, champs) :
 * c'est une approximation visuelle, le rendu exact dépend du téléphone.
 */
export type PreviewDesign = {
  mode: "stamps" | "points" | "cashback";
  programName: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor: string;
  stampColor: string;
  stripOverlay: number;
  stripImageUrl?: string | null;
  stampIconUrl?: string | null;
  stampEmptyIconUrl?: string | null;
};

export type PreviewProps = {
  platform: "apple" | "google";
  businessName: string;
  logoUrl?: string | null;
  customerName: string;
  design: PreviewDesign;
  state: CardState;
  /** Deuxième champ sous la bannière (ex : CADEAU / prochain cadeau / taux de cashback). */
  secondary?: { label: string; value: string } | null;
  couponsCount?: number;
  /** Image de bannière déjà fabriquée par le serveur (carte web). Sinon, dessin en direct. */
  stripUrl?: string | null;
};

function Stamp({ filled, design, size }: { filled: boolean; design: PreviewDesign; size: number }) {
  const src = filled ? design.stampIconUrl : (design.stampEmptyIconUrl ?? design.stampIconUrl);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: size, height: size, objectFit: "contain", opacity: filled || design.stampEmptyIconUrl ? 1 : 0.3 }}
      />
    );
  }
  return (
    <span
      style={{
        width: size * 0.88,
        height: size * 0.88,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: filled ? design.stampColor : "rgba(255,255,255,0.08)",
        border: filled ? "none" : `${Math.max(2, size * 0.06)}px dashed ${design.stampColor}`,
        opacity: filled ? 1 : 0.75,
        color: design.backgroundColor,
        fontWeight: 800,
        fontSize: size * 0.45,
        lineHeight: 1,
      }}
    >
      {filled ? "✓" : ""}
    </span>
  );
}

export default function CardPreview(p: PreviewProps) {
  const d = p.design;
  const bg = p.state.tier?.color || d.backgroundColor;
  const initial = (p.businessName.trim()[0] ?? "?").toUpperCase();
  const total = p.state.stamps?.total ?? 0;
  const filled = p.state.stamps?.filled ?? 0;
  const rows = total <= 6 ? 1 : total <= 14 ? 2 : 3;
  const cols = Math.max(1, Math.ceil(total / rows));
  const stampSize = Math.min(300 / cols, 88 / rows) * 0.9;

  return (
    <div className="w-full max-w-[340px]">
      <div className="text-xs font-semibold text-gray-500 mb-1">
        {p.platform === "apple" ? "Aperçu iPhone (Apple Wallet)" : "Aperçu Android (Google Wallet)"}
      </div>
      <div
        className={`overflow-hidden shadow-lg ${p.platform === "apple" ? "rounded-2xl" : "rounded-3xl"}`}
        style={{ background: bg, color: d.foregroundColor }}
      >
        {/* En-tête : logo + nom + solde */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            {p.logoUrl ? (
              <img src={p.logoUrl} alt="" className="h-8 w-8 rounded-md object-contain" />
            ) : (
              <span
                className="h-8 w-8 rounded-md grid place-items-center font-bold"
                style={{ background: d.foregroundColor, color: bg }}
              >
                {initial}
              </span>
            )}
            <span className="font-semibold truncate">{p.businessName || "Nom du commerce"}</span>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-semibold tracking-wider" style={{ color: d.labelColor }}>
              {p.state.balanceLabel}
            </div>
            <div className="font-semibold tabular-nums">{p.state.balanceValue}</div>
          </div>
        </div>

        {/* Bannière : décor + tampons ou solde */}
        <div className="relative w-full" style={{ aspectRatio: "375 / 123" }}>
          {p.stripUrl ? (
            <img src={p.stripUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <>
              {d.stripImageUrl && (
                <img src={d.stripImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {d.stripImageUrl && d.stripOverlay > 0 && (
                <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${d.stripOverlay / 100})` }} />
              )}
              {d.mode === "stamps" && (
                <div
                  className="absolute inset-0 grid place-content-center gap-y-1 px-3"
                  style={{ gridTemplateColumns: `repeat(${cols}, ${stampSize / 0.9}px)` }}
                >
                  {Array.from({ length: total }).map((_, i) => (
                    <span key={i} className="grid place-items-center">
                      <Stamp filled={i < filled} design={d} size={stampSize} />
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          {d.mode !== "stamps" && (
            <div className="absolute inset-0 flex flex-col justify-end px-4 pb-2">
              <div className="text-[10px] font-semibold tracking-wider" style={{ color: d.labelColor }}>
                {p.state.balanceLabel}
              </div>
              <div className="text-3xl font-semibold tabular-nums leading-tight">{p.state.balanceValue}</div>
            </div>
          )}
        </div>

        {/* Champs sous la bannière */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 text-sm">
          <div>
            <div className="text-[10px] font-semibold tracking-wider" style={{ color: d.labelColor }}>
              CLIENT
            </div>
            <div className="truncate">{p.customerName}</div>
          </div>
          {p.secondary && (
            <div>
              <div className="text-[10px] font-semibold tracking-wider truncate" style={{ color: d.labelColor }}>
                {p.secondary.label}
              </div>
              <div className="truncate">{p.secondary.value}</div>
            </div>
          )}
          {p.state.tier && (
            <div>
              <div className="text-[10px] font-semibold tracking-wider" style={{ color: d.labelColor }}>
                NIVEAU
              </div>
              <div className="truncate">{p.state.tier.name}</div>
            </div>
          )}
          {!!p.couponsCount && (
            <div>
              <div className="text-[10px] font-semibold tracking-wider" style={{ color: d.labelColor }}>
                OFFRES
              </div>
              <div>
                {p.couponsCount} disponible{p.couponsCount > 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>

        {/* QR code (simulé) */}
        <div className="pb-4">
          <div className="mx-auto w-24 h-24 bg-white rounded-lg grid place-items-center">
            <div className="w-16 h-16 grid grid-cols-4 gap-0.5" aria-hidden>
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className={[0, 1, 4, 3, 6, 9, 10, 12, 15, 13].includes(i) ? "bg-gray-900" : "bg-white"} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
