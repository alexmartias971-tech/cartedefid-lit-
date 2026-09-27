/** Aperçu de la carte, tel qu'elle apparaîtra dans le Wallet (approximation visuelle). */
export type PreviewProps = {
  businessName: string;
  programName: string;
  reward: string;
  threshold: number;
  stamps: number;
  customerName: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor: string;
  logoUrl?: string | null;
  platform: "apple" | "google";
};

export default function CardPreview(p: PreviewProps) {
  const t = Math.max(1, Math.min(50, p.threshold || 1));
  const s = Math.min(p.stamps, t);
  const initial = (p.businessName.trim()[0] ?? "?").toUpperCase();
  const logo = p.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.logoUrl} alt="" className="h-9 w-9 rounded-md object-contain bg-white/10" />
  ) : (
    <span
      className="h-9 w-9 rounded-md grid place-items-center font-bold"
      style={{ background: p.foregroundColor, color: p.backgroundColor }}
    >
      {initial}
    </span>
  );

  return (
    <div className="w-full max-w-[340px]">
      <div className="text-xs font-semibold text-gray-500 mb-1">
        {p.platform === "apple" ? "Aperçu iPhone (Apple Wallet)" : "Aperçu Android (Google Wallet)"}
      </div>
      <div
        className={`p-4 shadow-lg ${p.platform === "apple" ? "rounded-2xl" : "rounded-3xl"}`}
        style={{ background: p.backgroundColor, color: p.foregroundColor }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {logo}
            <span className="font-semibold truncate">{p.businessName || "Nom du commerce"}</span>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-semibold tracking-wider" style={{ color: p.labelColor }}>
              TAMPONS
            </div>
            <div className="font-semibold tabular-nums">
              {s}/{t}
            </div>
          </div>
        </div>

        <div className="mt-5 text-2xl font-semibold leading-tight">{p.programName || "Nom de la carte"}</div>

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${s} tampons sur ${t}`}>
          {Array.from({ length: t }).map((_, i) => (
            <span
              key={i}
              className="h-5 w-5 rounded-full border-2"
              style={{ borderColor: p.foregroundColor, background: i < s ? p.foregroundColor : "transparent" }}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-[10px] font-semibold tracking-wider" style={{ color: p.labelColor }}>
              CLIENT
            </div>
            <div className="truncate">{p.customerName}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold tracking-wider" style={{ color: p.labelColor }}>
              CADEAU
            </div>
            <div className="truncate">{p.reward || "Ton cadeau"}</div>
          </div>
        </div>

        <div className="mt-4 mx-auto w-24 h-24 bg-white rounded-lg grid place-items-center">
          <div className="w-16 h-16 grid grid-cols-4 gap-0.5" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className={[0, 1, 4, 3, 6, 9, 10, 12, 15, 13].includes(i) ? "bg-gray-900" : "bg-white"} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
