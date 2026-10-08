"use client";

import { useMemo } from "react";
import { FIELD_SLOTS, SLOT_SOURCES, layerPos, type ArtFormat, type ArtLayer, type CardLayout, type FieldSlot, type SlotSource } from "@/lib/layout";
import { inkOn } from "@/lib/visual";
import { MASCOT_LABELS, mascotSvg, type MascotPose } from "@/lib/mascot";
import { FONT_CHOICES, shapeText } from "@/lib/text-shape";
import { LINE_ICON_LABELS, LINE_ICONS } from "@/lib/visual";
import type { Ambiance } from "./content";
import { AMBIANCES } from "./content";
import { bringFront, centerLayer, duplicateLayer, iconLayer, mascotLayer, moveLayer, removeLayer, resetFormat, setCrop, setStampsY, setText, textLayer, updateLayer } from "./layers";
import { conflictMessage, conflicts } from "./overlap";
import { PLATFORMS } from "./Stage";
import { emptyImage, promise, recommendedSlots, type Draft, type Images } from "./state";
import { Choice, ColorPick, Field, ImagePicker, More, Section, Segmented, Toggle } from "./ui";

export type Tool = "fond" | "logo" | "tampons" | "couleurs" | "decor" | "infos";

export const TOOLS: { id: Tool; label: string }[] = [
  { id: "fond", label: "Fond" },
  { id: "logo", label: "Logo" },
  { id: "tampons", label: "Tampons" },
  { id: "couleurs", label: "Couleurs" },
  { id: "decor", label: "Plus d'options" },
];

const FILL_CHOICES: { id: "aurore" | "halo" | "soleil" | "uni" | null; label: string }[] = [
  { id: "aurore", label: "Aurore" },
  { id: "halo", label: "Halo" },
  { id: "soleil", label: "Soleil" },
  { id: "uni", label: "Uni" },
  { id: null, label: "Dégradé simple" },
];

/** Taille idéale d'un visuel propre à chaque téléphone (en pixels). */
const IDEAL: Record<ArtFormat, string> = { poster: "1074 × 1344 px (vertical)", apple: "1125 × 432 px (bandeau)", google: "1032 × 812 px (presque carré)" };

/** Icônes proposées (sans le cornet de glace, trop proche d'un triangle, ni la coche). */
const STICKERS = Object.keys(LINE_ICONS).filter((id) => !["check", "icecream", "gift"].includes(id));

const ZONE_LABELS: Record<FieldSlot, string> = { top: "En haut à droite", b1: "1re info", b2: "2e info", b3: "3e info", b4: "4e info" };

function IconGlyph({ id, size = 22 }: { id: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LINE_ICONS[id] ?? "" }} />
  );
}

function FontSample({ id }: { id: string }) {
  const s = useMemo(() => shapeText("Aa", id), [id]);
  return (
    <svg viewBox={`${-40} ${-s.cap - 260} ${s.w + 80} ${s.cap + 520}`} className="h-7 w-auto" aria-hidden="true">
      <path d={s.d} fill="currentColor" transform="scale(1 -1)" />
    </svg>
  );
}

/** Contraste entre deux couleurs (1 à 21). */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16) || 0;
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

type StampStyle = "classic" | "logo" | "icons" | "minimal" | "track" | "none";

function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  const x = p(a);
  const y = p(b);
  return `#${x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** 3 ambiances fabriquées à partir des couleurs du logo. */
function palettesFrom(colors: string[]): Ambiance[] {
  if (colors.length === 0) return [];
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const deep = (c: string) => (lum(c) > 0.55 ? mixHex(c, "#000000", 0.55) : c);
  const make = (id: string, label: string, bg: string, accent: string): Ambiance => {
    const fg = inkOn(bg) === "#ffffff" ? "#FFFFFF" : "#1A1320";
    return { id, label, background_color: bg, foreground_color: fg, label_color: mixHex(fg, bg, 0.3), stamp_color: accent };
  };
  const [a, b] = colors;
  const out = [make("logo1", "Votre logo", deep(a), b ?? (lum(a) > 0.55 ? a : "#FFD166"))];
  if (b) out.push(make("logo2", "Votre logo (bis)", deep(b), a));
  out.push(make("logo3", "Nuit + logo", "#121016", lum(a) > 0.2 ? a : (b ?? "#FFD166")));
  return out;
}

function stampStyleOf(d: Draft): StampStyle | "legacy" {
  if (d.progress_style === "minimal" || d.progress_style === "track" || d.progress_style === "none") return d.progress_style;
  if (d.progress_style !== "glass") return "legacy"; // ancien style (grille, collection, remplissage)
  return d.layout.look ?? "icons";
}

export default function StepLook({
  d,
  set,
  updateLayout,
  images,
  platform,
  tool,
  setTool,
  selected,
  setSelected,
  pickStrip,
  removeStrip,
  pickBg,
  removeBg,
  pickLogo,
  logoOnArt,
  setLogoOnArt,
  photoRatio,
  logoColors,
  logoRatio,
}: {
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  updateLayout: (fn: (l: CardLayout) => CardLayout) => void;
  images: Images;
  platform: ArtFormat;
  tool: Tool;
  setTool: (t: Tool) => void;
  selected: string | null;
  setSelected: (s: string | null) => void;
  pickStrip: (f: File) => void;
  removeStrip: () => void;
  pickBg: (fmt: ArtFormat, f: File) => void;
  removeBg: (fmt: ArtFormat) => void;
  pickLogo: (f: File) => void;
  logoOnArt: boolean;
  setLogoOnArt: (on: boolean) => void;
  photoRatio: number | null;
  logoColors: string[];
  logoRatio: number | null;
}) {
  const plat = PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0];
  const hasLogo = !!images.logo.preview;
  const photo = images.bg[platform]?.preview || images.strip.preview;
  const crop = d.layout.crop?.[platform] ?? null;
  const layerId = selected?.startsWith("layer:") ? selected.slice(6) : null;
  const layer = layerId ? (d.layout.layers.find((l) => l.id === layerId) ?? null) : null;
  const logoL = d.layout.layers.find((l) => l.kind === "logo") ?? null;
  const features = { tiers: d.tiers_enabled, streak: d.streak_enabled, lap: d.lap_times_enabled };
  const style = stampStyleOf(d);
  const hasStamps = d.mode !== "cashback";
  const tools = TOOLS.filter((t) => t.id !== "tampons" || hasStamps);
  const moreTab = tool === "decor" || tool === "infos";

  const setStyle = (s: StampStyle) => {
    if (s === "minimal" || s === "track" || s === "none") set({ progress_style: s });
    else set({ progress_style: "glass", layout: { ...d.layout, look: s } });
  };

  const sizeOf = (l: ArtLayer) => layerPos(l, platform).size;

  // Un élément posé sur les tampons ou sur le QR code, sur l'un des 3 téléphones : on prévient (la carte doit rester lisible partout)
  const warningsFor = (l: ArtLayer | null) => conflicts(d, l, logoRatio, platform).map((c) => conflictMessage(c, platform));
  const palettes = palettesFrom(logoColors);

  return (
    <div className="wz-step">
      <div className="wz-tools" role="tablist" aria-label="Outils">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tool === t.id || (t.id === "decor" && moreTab)}
            className={`wz-tool ${tool === t.id || (t.id === "decor" && moreTab) ? "wz-tool-on" : ""}`}
            onClick={() => {
              setTool(t.id);
              setSelected(null);
            }}
          >
            {t.id === "tampons" && d.mode === "points" ? "Progression" : t.label}
          </button>
        ))}
      </div>
      {moreTab && (
        <Segmented
          value={tool}
          onChange={(t) => {
            setTool(t);
            setSelected(null);
          }}
          label="Plus d'options"
          size="sm"
          options={[
            { value: "decor" as Tool, label: "Textes, autocollants, Walty" },
            { value: "infos" as Tool, label: "Infos affichées" },
          ]}
        />
      )}

      {tool === "fond" && (
        <Section title="Le visuel de fond" hint="Cliquez sur la carte pour sélectionner, glissez pour recadrer.">
          <ImagePicker
            slot={images.strip}
            onPick={pickStrip}
            onRemove={removeStrip}
            label="Votre photo ou visuel (pour tous les téléphones)"
            empty="Ajouter une photo"
            hint="Une photo de votre commerce ou de vos produits, prise avec votre téléphone, suffit. Évitez le texte dans l'image : Apple et Google le déconseillent, et la carte écrit déjà les infos."
          />
          {photo && (
            <div className="wz-sub">
              <span className="wz-label">Cadrage sur {plat.label}</span>
              <p className="wz-hint">La photo s&apos;adapte toute seule à chaque téléphone. Pour choisir ce qui reste visible, faites glisser la photo directement sur la carte.</p>
              <label className="wz-field">
                <span className="wz-hint">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={crop?.zoom ?? 1}
                  disabled={!photoRatio}
                  onChange={(e) => updateLayout((l) => setCrop(l, platform, { x: crop?.x ?? 0.5, y: crop?.y ?? 0.5, zoom: Number(e.target.value) }))}
                  className="wz-range"
                  aria-label="Zoom de la photo"
                />
              </label>
              {crop && (
                <button type="button" className="wz-link" onClick={() => updateLayout((l) => setCrop(l, platform, null))}>
                  Revenir au cadrage automatique
                </button>
              )}
              <label className="wz-field">
                <span className="wz-hint">Assombrir la photo (pour bien lire les textes) : {d.strip_overlay} %</span>
                <input type="range" min={0} max={60} step={5} value={d.strip_overlay} onChange={(e) => set({ strip_overlay: Number(e.target.value) })} className="wz-range" />
              </label>
            </div>
          )}
          <More title={`Utiliser un autre visuel sur ${plat.label}`} hint={`Utile si votre visuel contient du texte ou une composition précise. Taille idéale : ${IDEAL[platform]}.`} defaultOpen={!!images.bg[platform]?.preview}>
            <ImagePicker slot={images.bg[platform] ?? emptyImage()} onPick={(f) => pickBg(platform, f)} onRemove={() => removeBg(platform)} label={`Visuel pour ${plat.label}`} empty="Choisir ce visuel" />
          </More>
          {!photo && (
            <div className="wz-field">
              <span className="wz-label">Pas de photo ? Choisissez un fond</span>
              <div className="wz-fills" role="radiogroup" aria-label="Fond sans photo">
                {FILL_CHOICES.map((f) => {
                  const on = (d.layout.fill ?? null) === f.id;
                  const bg = d.background_color;
                  const ac = d.stamp_color;
                  const preview =
                    f.id === "aurore"
                      ? `radial-gradient(circle at 88% 8%, ${ac}bb, transparent 60%), radial-gradient(circle at 8% 98%, ${bg}, transparent 70%), ${bg}`
                      : f.id === "halo"
                        ? `radial-gradient(circle at 50% 42%, ${bg}, transparent 70%), radial-gradient(circle at 50% 105%, ${ac}88, transparent 60%), #00000088`
                        : f.id === "soleil"
                          ? `linear-gradient(${ac}cc, ${bg} 55%, ${bg})`
                          : f.id === "uni"
                            ? bg
                            : `linear-gradient(135deg, ${bg}, #000000aa)`;
                  return (
                    <button key={f.label} type="button" role="radio" aria-checked={on} className={`wz-fill ${on ? "wz-fill-on" : ""}`} onClick={() => set({ layout: { ...d.layout, fill: f.id ?? undefined } })}>
                      <span className="wz-fill-swatch" style={{ background: preview, backgroundColor: bg }} />
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <p className="wz-hint">Ces fonds sont fabriqués avec les couleurs de votre carte (outil « Couleurs »).</p>
            </div>
          )}
        </Section>
      )}

      {tool === "logo" && (
        <Section title="Votre logo">
          <ImagePicker slot={images.logo} onPick={pickLogo} label="Votre logo" empty="Ajouter votre logo" contain hint="Un PNG à fond transparent rend le mieux." />
          {hasLogo && (
            <>
              {(logoRatio ?? 1) > 1.8 && (
                <p className="wz-tip">Votre logo est très allongé : en petit (en haut de la carte, rond Android), il sera difficile à lire. Si vous avez une version carrée (le symbole seul), mettez-la à la place avec « Changer ».</p>
              )}
              <Toggle checked={logoOnArt} onChange={setLogoOnArt} label="Logo en grand sur le visuel" hint="Faites-le glisser sur la carte ; le rond blanc l'agrandit ou le réduit." />
              {logoL && warningsFor(logoL).map((w) => <p key={w} className="wz-warn">{w}</p>)}
              {logoL && (
                <div className="wz-sub">
                  <label className="wz-field">
                    <span className="wz-hint">Taille</span>
                    <input type="range" min={6} max={80} step={0.5} value={sizeOf(logoL)} onChange={(e) => updateLayout((l) => moveLayer(l, logoL.id, { size: Number(e.target.value) }, platform))} className="wz-range" aria-label="Taille du logo" />
                  </label>
                  <Toggle
                    checked={!!logoL.bg}
                    onChange={(on) => updateLayout((l) => updateLayer(l, logoL.id, { bg: on ? "#FFFFFF" : null }))}
                    label="Pastille blanche derrière le logo"
                    hint="Pratique si votre logo est foncé sur une photo sombre."
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="wz-btn wz-btn-ghost" onClick={() => updateLayout((l) => centerLayer(l, logoL.id, platform))}>↔ Centrer</button>
                    {platform !== "poster" && logoL.at?.[platform as "apple" | "google"] && (
                      <button type="button" className="wz-btn wz-btn-ghost" onClick={() => updateLayout((l) => resetFormat(l, logoL.id, platform))}>Comme sur l&apos;iPhone</button>
                    )}
                  </div>
                </div>
              )}
              <Toggle
                checked={d.show_logo_text}
                onChange={(on) => set({ show_logo_text: on, layout: { ...d.layout, topLogo: undefined } })}
                label="Afficher le nom du commerce en haut"
                hint="À désactiver si votre logo contient déjà le nom."
              />
              <p className="wz-hint">Votre logo s&apos;affiche aussi en petit en haut de la carte : Apple et Google l&apos;imposent (sur Android, dans un rond).</p>
            </>
          )}
        </Section>
      )}

      {tool === "tampons" && hasStamps && (
        <Section title={d.mode === "points" ? "La barre de progression" : "Les tampons"} hint={d.mode === "stamps" ? `${d.reward_threshold} cases (le nombre se règle à l'étape « La récompense »).` : "Elle se remplit jusqu'au prochain cadeau."}>
          {d.mode === "points" ? (
            <div className="wz-styles" role="radiogroup" aria-label="Style de la progression">
              <Choice on={style !== "none"} onClick={() => setStyle("classic")} title="Jauge" text="Une barre qui se remplit jusqu'au cadeau" badge="Conseillé" className="wz-choice-sm" />
              <Choice on={style === "none"} onClick={() => setStyle("none")} title="Compteur seul" text="Le nombre de points, en texte" className="wz-choice-sm" />
            </div>
          ) : (
          <div className="wz-styles" role="radiogroup" aria-label="Style des tampons">
            <Choice on={style === "classic"} onClick={() => setStyle("classic")} title="Tampon classique" text="Un rond plein, comme un coup de tampon" badge="Conseillé" className="wz-choice-sm" />
            <Choice on={style === "logo"} onClick={() => (hasLogo ? setStyle("logo") : setTool("logo"))} title="Votre logo" text={hasLogo ? "Chaque tampon porte votre logo (idéal avec un logo rond ou carré)" : "Ajoutez d'abord un logo"} className={`wz-choice-sm ${hasLogo ? "" : "opacity-60"}`} />
            <Choice on={style === "icons"} onClick={() => setStyle("icons")} title="Icônes" text="Un dessin de votre métier" className="wz-choice-sm" />
            <Choice on={style === "minimal"} onClick={() => setStyle("minimal")} title="Points fins" text="Une rangée discrète" className="wz-choice-sm" />
            {(d.trade === "sport" || d.legacy.track || style === "track") && <Choice on={style === "track"} onClick={() => setStyle("track")} title="Circuit" text="Karting, sport mécanique" className="wz-choice-sm" />}
            {style === "legacy" && <Choice on onClick={() => undefined} title="Style actuel" text="Ancien style de la carte (choisissez-en un autre pour le changer)" className="wz-choice-sm" />}
            <Choice on={style === "none"} onClick={() => setStyle("none")} title="Compteur seul" text="Pas de dessin, le compteur en texte" className="wz-choice-sm" />
          </div>
          )}
          {style === "logo" && d.mode === "stamps" && (logoRatio ?? 1) > 1.4 && (
            <p className="wz-warn">Votre logo est très allongé : dans un petit rond, il sera difficile à lire. Le « tampon classique » rendra mieux.</p>
          )}
          {style !== "none" && <ColorPick label={d.mode === "points" ? "Couleur de la jauge et du cadeau" : "Couleur des tampons et du cadeau"} value={d.stamp_color} onChange={(c) => set({ stamp_color: c })} />}
          {style === "icons" && d.mode === "stamps" && (
            <div className="wz-field">
              <span className="wz-label">Icônes des cases (dans l&apos;ordre, 10 au maximum)</span>
              <div className="wz-icon-grid">
                {[...STICKERS, ...d.collection.filter((id) => !STICKERS.includes(id) && LINE_ICONS[id])].map((id) => {
                  const pos = d.collection.indexOf(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      title={LINE_ICON_LABELS[id]}
                      aria-label={LINE_ICON_LABELS[id]}
                      aria-pressed={pos >= 0}
                      onClick={() => {
                        if (pos < 0 && d.collection.length >= 10) return; // 10 icônes au maximum
                        const next = pos >= 0 ? d.collection.filter((x) => x !== id) : [...d.collection, id];
                        set({ collection: next.length ? next : [id], icon_preset: next[0] ?? id });
                        // (au moins une icône reste toujours choisie)
                      }}
                      className={`wz-icon-pick ${pos >= 0 ? "wz-icon-pick-on" : ""}`}
                    >
                      <IconGlyph id={id} />
                      {pos >= 0 && d.collection.length > 1 && <span className="wz-icon-pick-num">{pos + 1}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {d.mode === "stamps" && style !== "none" && <Toggle checked={d.reward_on_last} onChange={(on) => set({ reward_on_last: on })} label="La dernière case montre le cadeau 🎁" />}
          {(style === "classic" || style === "logo" || style === "icons" || style === "minimal") && (
            <p className="wz-tip">
              ↕ Faites glisser {d.mode === "points" ? "la jauge" : "la rangée de tampons"} sur la carte pour la monter ou la descendre.
              {d.layout.stamps?.[platform] !== undefined && (
                <button type="button" className="wz-link ml-1" onClick={() => updateLayout((l) => setStampsY(l, platform, null))}>Remettre à sa place</button>
              )}
            </p>
          )}
        </Section>
      )}

      {tool === "couleurs" && (
        <Section title="Les couleurs">
          {palettes.length > 0 && (
            <div className="wz-field">
              <span className="wz-label">Tirées de votre logo</span>
              <div className="wz-ambiances">
                {palettes.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`wz-ambiance ${d.background_color.toLowerCase() === a.background_color.toLowerCase() && d.stamp_color.toLowerCase() === a.stamp_color.toLowerCase() ? "wz-ambiance-on" : ""}`}
                    onClick={() => set({ background_color: a.background_color, foreground_color: a.foreground_color, label_color: a.label_color, stamp_color: a.stamp_color })}
                  >
                    <span className="wz-ambiance-dot" style={{ background: `linear-gradient(135deg, ${a.background_color} 55%, ${a.stamp_color})` }} />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="wz-field">
            <span className="wz-label">Ambiances prêtes</span>
            <div className="wz-ambiances">
              {AMBIANCES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`wz-ambiance ${d.background_color.toLowerCase() === a.background_color.toLowerCase() ? "wz-ambiance-on" : ""}`}
                  onClick={() => set({ background_color: a.background_color, foreground_color: a.foreground_color, label_color: a.label_color, stamp_color: a.stamp_color })}
                >
                  <span className="wz-ambiance-dot" style={{ background: `linear-gradient(135deg, ${a.background_color} 55%, ${a.stamp_color})` }} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <More title="Choisir chaque couleur" hint="Fond, textes et petits titres, un par un.">
            <ColorPick label="Fond de la carte" value={d.background_color} onChange={(c) => set({ background_color: c })} />
            <ColorPick label="Textes" value={d.foreground_color} onChange={(c) => set({ foreground_color: c })} />
            <ColorPick label="Petits titres (au-dessus des infos)" value={d.label_color} onChange={(c) => set({ label_color: c })} />
          </More>
          {contrast(d.foreground_color, d.background_color) < 3 && <p className="wz-warn">Les textes risquent d&apos;être difficiles à lire sur ce fond : choisissez une couleur plus claire ou plus foncée.</p>}
        </Section>
      )}

      {tool === "decor" && (
        <Section title="Décorer le visuel" hint="Facultatif. Gardez la carte sobre : un ou deux éléments suffisent.">
          {!layer || layer.kind === "logo" ? (
            <>
              <button type="button" className="wz-btn wz-btn-soft w-full" onClick={() => {
                const l = textLayer(d.layout.layers.filter((x) => x.kind === "text").length);
                updateLayout((lay) => ({ ...lay, layers: [...lay.layers, l] }));
                setSelected(`layer:${l.id}`);
              }}>+ Ajouter un texte</button>
              <div className="wz-field">
                <span className="wz-label">Autocollants</span>
                <div className="wz-icon-grid">
                  {STICKERS.map((id) => (
                    <button key={id} type="button" title={LINE_ICON_LABELS[id]} aria-label={`Ajouter : ${LINE_ICON_LABELS[id]}`} className="wz-icon-pick" onClick={() => {
                      const l = iconLayer(id, d.layout.layers.filter((x) => x.kind === "icon").length);
                      updateLayout((lay) => ({ ...lay, layers: [...lay.layers, l] }));
                      setSelected(`layer:${l.id}`);
                    }}>
                      <IconGlyph id={id} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="wz-field">
                <span className="wz-label">Walty, la mascotte</span>
                <p className="wz-hint">Facultatif : un clin d&apos;œil à l&apos;application qui fait votre carte. Placez-le loin des tampons et du QR code.</p>
                <div className="wz-mascots">
                  {(Object.keys(MASCOT_LABELS) as MascotPose[]).map((pose) => (
                    <button key={pose} type="button" className="wz-mascot" aria-label={`Ajouter ${MASCOT_LABELS[pose]}`} onClick={() => {
                      const l = mascotLayer(pose);
                      updateLayout((lay) => ({ ...lay, layers: [...lay.layers, l] }));
                      setSelected(`layer:${l.id}`);
                    }}>
                      <svg viewBox={pose === "peek" ? "0 0 180 134" : "0 0 260 300"} aria-hidden="true" dangerouslySetInnerHTML={{ __html: pose === "peek" ? mascotSvg(pose, 90, 67, 134, `pick-${pose}`) : mascotSvg(pose, 130, 150, 300, `pick-${pose}`) }} />
                      <span>{MASCOT_LABELS[pose]}</span>
                    </button>
                  ))}
                </div>
              </div>
              {d.layout.layers.filter((l) => l.kind !== "logo").length > 0 && <p className="wz-hint">Touchez un élément sur l&apos;aperçu pour le modifier ou le supprimer.</p>}
            </>
          ) : (
            <>
              {warningsFor(layer).map((w) => <p key={w} className="wz-warn">{w}</p>)}
              <LayerPanel layer={layer} layout={d.layout} platform={platform} updateLayout={updateLayout} setSelected={setSelected} backgroundColor={d.background_color} />
            </>
          )}
        </Section>
      )}

      {tool === "infos" && (
        <Section title="Les infos affichées" hint="Sous le visuel, Apple et Google affichent quelques infos. Par défaut : où en est le client, puis son cadeau.">
          <Field label="Titre de la carte (grand titre sur Android)" hint={d.titleAuto ? "Il suit votre récompense automatiquement." : undefined}>
            <input className="wz-input" value={d.program_name} maxLength={40} onChange={(e) => set({ program_name: e.target.value, titleAuto: false })} />
            {!d.titleAuto && (
              <button type="button" className="wz-link" onClick={() => set({ titleAuto: true, program_name: promise(d) })}>Revenir au titre automatique</button>
            )}
          </Field>
          {FIELD_SLOTS.map((z) => (
            <SlotRow key={z} zone={z} layout={d.layout} features={features} updateLayout={updateLayout} />
          ))}
          <p className="wz-hint">iPhone : toutes ces infos. Android : Google n&apos;affiche que 2 infos très courtes, choisies automatiquement (la progression, puis les offres ou ce qu&apos;il reste avant le cadeau) ; le cadeau est dans le titre.</p>
          <Field label="Message du bas (iPhone à jour)">
            <Segmented
              value={d.layout.slots?.foot?.src ?? "sentence"}
              onChange={(src) => updateLayout((l) => ({ ...l, slots: { ...l.slots, foot: { src, value: l.slots?.foot?.value } } }))}
              label="Message du bas"
              options={[{ value: "sentence", label: "Progression auto" }, { value: "custom", label: "Mon message" }, { value: "none", label: "Rien" }]}
            />
            {d.layout.slots?.foot?.src === "custom" ? (
              <input className="wz-input" maxLength={90} value={d.layout.slots.foot.value ?? ""} onChange={(e) => updateLayout((l) => ({ ...l, slots: { ...l.slots, foot: { src: "custom", value: e.target.value } } }))} placeholder="Ex : Merci de ta fidélité 🌴 (vos clients sont tutoyés)" />
            ) : (
              <p className="wz-hint">Ex : « Plus que 2 passages avant ton cadeau ». La phrase change toute seule à chaque passage.</p>
            )}
          </Field>
          <button type="button" className="wz-btn wz-btn-ghost w-full" onClick={() => updateLayout((l) => ({ ...l, slots: recommendedSlots(features) }))}>↺ Disposition conseillée</button>
        </Section>
      )}
    </div>
  );
}

function SlotRow({
  zone,
  layout,
  features,
  updateLayout,
}: {
  zone: FieldSlot;
  layout: CardLayout;
  features: { tiers: boolean; streak: boolean; lap: boolean };
  updateLayout: (fn: (l: CardLayout) => CardLayout) => void;
}) {
  const cfg = layout.slots?.[zone] ?? { src: "none" as SlotSource };
  const list = SLOT_SOURCES.filter((s) => !s.needs || features[s.needs] || s.src === cfg.src);
  const setSlot = (patch: Partial<{ src: SlotSource; label: string; value: string }>) =>
    updateLayout((l) => ({ ...l, slots: { ...l.slots, [zone]: { ...(l.slots?.[zone] ?? { src: "none" }), ...patch } } }));
  return (
    <div className="wz-slot">
      <label className="wz-slot-name" htmlFor={`slot-${zone}`}>{ZONE_LABELS[zone]}</label>
      <select id={`slot-${zone}`} className="wz-input" value={cfg.src} onChange={(e) => setSlot({ src: e.target.value as SlotSource })}>
        {list.map((s) => (
          <option key={s.src} value={s.src}>{s.label}</option>
        ))}
      </select>
      {cfg.src !== "none" && (
        <input className="wz-input wz-slot-title" maxLength={20} value={cfg.label ?? ""} onChange={(e) => setSlot({ label: e.target.value })} placeholder="Petit titre (auto)" aria-label={`Petit titre : ${ZONE_LABELS[zone]}`} />
      )}
      {cfg.src === "custom" && (
        <input className="wz-input wz-slot-value" maxLength={40} value={cfg.value ?? ""} onChange={(e) => setSlot({ value: e.target.value })} placeholder="Votre texte" aria-label={`Texte : ${ZONE_LABELS[zone]}`} />
      )}
    </div>
  );
}

function LayerPanel({
  layer,
  layout,
  platform,
  updateLayout,
  setSelected,
  backgroundColor,
}: {
  layer: ArtLayer;
  layout: CardLayout;
  platform: ArtFormat;
  updateLayout: (fn: (l: CardLayout) => CardLayout) => void;
  setSelected: (s: string | null) => void;
  backgroundColor: string;
}) {
  const size = layerPos(layer, platform).size;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <b>{layer.kind === "text" ? "Texte" : layer.kind === "mascot" ? "Walty" : "Autocollant"}</b>
        <button type="button" className="wz-link" onClick={() => setSelected(null)}>← Retour</button>
      </div>
      {layer.kind === "text" && (
        <>
          <textarea
            className="wz-input wz-input-lg"
            rows={2}
            maxLength={80}
            value={layer.text ?? ""}
            onChange={(e) => updateLayout((l) => setText(l, layer.id, e.target.value.split("\n").slice(0, 3).join("\n")))}
            aria-label="Texte"
          />
          <div className="grid grid-cols-2 gap-2">
            {FONT_CHOICES.map((f) => (
              <button key={f.id} type="button" className={`wz-option ${layer.font === f.id ? "wz-option-on" : ""}`} onClick={() => updateLayout((l) => setText(l, layer.id, layer.text ?? "Texte", f.id))}>
                <FontSample id={f.id} />
                <span className="text-sm">{f.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {layer.kind === "mascot" && (
        <Segmented
          value={layer.pose ?? "wave"}
          onChange={(pose) => updateLayout((l) => updateLayer(l, layer.id, { pose }))}
          label="Pose de Walty"
          options={(Object.keys(MASCOT_LABELS) as MascotPose[]).map((p) => ({ value: p, label: MASCOT_LABELS[p].replace("Walty ", "") }))}
        />
      )}
      {(layer.kind === "text" || layer.kind === "icon") && (
        <>
          <ColorPick label="Couleur" value={layer.color} onChange={(c) => updateLayout((l) => updateLayer(l, layer.id, { color: c }))} />
          <Toggle
            checked={!!layer.bg}
            onChange={(on) => updateLayout((l) => updateLayer(l, layer.id, { bg: on ? (layer.color.toLowerCase() === "#ffffff" ? backgroundColor : "#FFFFFF") : null }))}
            label={layer.kind === "text" ? "Pastille derrière le texte" : "Rond derrière le dessin"}
          />
          {layer.bg && <ColorPick label="Couleur du fond" value={layer.bg} onChange={(c) => updateLayout((l) => updateLayer(l, layer.id, { bg: c }))} />}
        </>
      )}
      <label className="wz-field">
        <span className="wz-hint">Taille</span>
        <input type="range" min={2} max={layer.kind === "text" ? 24 : 80} step={0.5} value={size} onChange={(e) => updateLayout((l) => moveLayer(l, layer.id, { size: Number(e.target.value) }, platform))} className="wz-range" aria-label="Taille" />
      </label>
      <label className="wz-field">
        <span className="wz-hint">Rotation : {layer.rot}°</span>
        <input type="range" min={-180} max={180} step={1} value={layer.rot} onChange={(e) => updateLayout((l) => moveLayer(l, layer.id, { rot: Number(e.target.value) }, platform))} className="wz-range" aria-label="Rotation" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="wz-btn wz-btn-ghost" onClick={() => updateLayout((l) => centerLayer(l, layer.id, platform))}>↔ Centrer</button>
        <button type="button" className="wz-btn wz-btn-ghost" onClick={() => updateLayout((l) => bringFront(l, layer.id))}>⬆ Devant</button>
        <button type="button" className="wz-btn wz-btn-ghost" onClick={() => {
          const r = duplicateLayer(layout, layer.id);
          updateLayout(() => r.layout);
          if (r.id) setSelected(`layer:${r.id}`);
        }}>⧉ Dupliquer</button>
        <button type="button" className="wz-btn wz-btn-danger" onClick={() => {
          updateLayout((l) => removeLayer(l, layer.id));
          setSelected(null);
        }}>Supprimer</button>
      </div>
      {platform !== "poster" && (
        <p className="wz-tip">
          Sur ce téléphone, la position et la taille sont propres à ce format.
          {layer.at?.[platform as "apple" | "google"] && (
            <button type="button" className="wz-link ml-1" onClick={() => updateLayout((l) => resetFormat(l, layer.id, platform))}>Recaler comme sur l&apos;iPhone</button>
          )}
        </p>
      )}
    </div>
  );
}
