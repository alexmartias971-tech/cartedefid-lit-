"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import CardPreview, { type CardEditorHooks } from "@/components/CardPreview";
import type { CardDesign, CardState, ResolvedSlots } from "@/lib/card-state";
import {
  defaultSlots,
  FIELD_SLOTS,
  SLOT_SOURCES,
  type ArtFormat,
  type ArtLayer,
  type CardLayout,
  type FieldSlot,
  type FootSource,
  type SlotSource,
} from "@/lib/layout";
import { FONT_CHOICES, shapeText } from "@/lib/text-shape";
import { THEMES } from "@/lib/themes";
import { LINE_ICON_LABELS, LINE_ICONS } from "@/lib/visual";
import { newKey, type TierRow, type Values } from "./shared";
import { ColorPick, Segmented, Stepper, Toggle } from "./ui";

type Platform = "poster" | "apple" | "google";
const PLATFORMS: { id: Platform; label: string; hint: string }[] = [
  { id: "poster", label: "iPhone récent", hint: "iOS 27 et plus : la photo remplit toute la carte" },
  { id: "apple", label: "iPhone (ancien)", hint: "iOS 26 et avant : photo en bandeau" },
  { id: "google", label: "Android", hint: "Google Wallet : photo en bas de la carte" },
];
const FORMAT_OF: Record<Platform, ArtFormat> = { poster: "poster", apple: "apple", google: "google" };

const ZONE_TITLES: Record<string, string> = {
  top: "Zone en haut à droite",
  b1: "Champ 1",
  b2: "Champ 2",
  b3: "Champ 3",
  b4: "Champ 4",
  foot: "Ligne du bas",
};

const PROGRESS_STYLES: { value: CardDesign["progressStyle"]; title: string; text: string }[] = [
  { value: "glass", title: "Verre dépoli", text: "Une bande floutée avec les icônes" },
  { value: "minimal", title: "Points fins", text: "Une rangée de petits points" },
  { value: "track", title: "Circuit néon", text: "Un circuit qui s'allume (sport, course)" },
  { value: "none", title: "Aucun dessin", text: "Le compteur s'affiche en texte" },
];

const ICON_IDS = Object.keys(LINE_ICONS).filter((id) => id !== "check");

const clamp01 = (n: number) => Math.round(Math.min(1.1, Math.max(-0.1, n)) * 10000) / 10000;

function IconGlyph({ id, size = 22, color = "currentColor" }: { id: string; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LINE_ICONS[id] ?? "" }} />
  );
}

/** Aperçu « Aa » dessiné avec la police (identique au rendu final). */
function FontSample({ id }: { id: string }) {
  const s = useMemo(() => shapeText("Aa", id), [id]);
  return (
    <svg viewBox={`${-40} ${-s.cap - 260} ${s.w + 80} ${s.cap + 520}`} className="h-7 w-auto" aria-hidden="true">
      <path d={s.d} fill="currentColor" transform="scale(1 -1)" />
    </svg>
  );
}

type Props = {
  v: Values;
  set: (patch: Partial<Values>) => void;
  design: CardDesign;
  layout: CardLayout;
  setLayout: React.Dispatch<React.SetStateAction<CardLayout>>;
  collection: string[];
  setCollection: (c: string[]) => void;
  logoUrl: string | null;
  stripUrl: string | null;
  onPickLogo: () => void;
  onPickPhoto: () => void;
  onRemovePhoto: () => void;
  cardState: CardState;
  progress: { total: number; filled: number };
  slots: ResolvedSlots | null;
  photo: string | null;
  sampleFilled: number;
  setSampleFilled: (n: number) => void;
  tierRows: TierRow[];
  previewTier: string;
  setPreviewTier: (k: string) => void;
  goToStep: (s: number) => void;
};

export default function DesignStep(p: Props) {
  const { v, set, layout, setLayout } = p;
  const [platform, setPlatform] = useState<Platform>("poster");
  const [selected, setSelected] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const inspector = useRef<HTMLElement>(null);
  const format = FORMAT_OF[platform];

  // Sur téléphone, le panneau de réglages est sous la carte : on le montre quand on choisit une zone
  useEffect(() => {
    if (!selected || selected.startsWith("layer:") || window.innerWidth >= 1024) return;
    inspector.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);
  const features = { tiers: v.tiers_enabled, streak: v.streak_enabled, lap: v.lap_times_enabled };

  const layerId = selected?.startsWith("layer:") ? selected.slice(6) : null;
  const layer = layerId ? layout.layers.find((l) => l.id === layerId) ?? null : null;

  /* ---------- Modifications ---------- */
  const updateLayer = (id: string, patch: Partial<ArtLayer>) =>
    setLayout((l) => ({ ...l, layers: l.layers.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const moveLayer = (id: string, change: { x?: number; y?: number; size?: number; rot?: number }, fmt: ArtFormat) =>
    setLayout((l) => ({
      ...l,
      layers: l.layers.map((x) => {
        if (x.id !== id) return x;
        const rot = change.rot !== undefined ? change.rot : x.rot;
        const pos = {
          ...(change.x !== undefined ? { x: clamp01(change.x) } : {}),
          ...(change.y !== undefined ? { y: clamp01(change.y) } : {}),
          ...(change.size !== undefined ? { size: Math.round(change.size * 100) / 100 } : {}),
        };
        if (fmt === "poster") return { ...x, rot, ...pos };
        if (Object.keys(pos).length === 0) return { ...x, rot };
        const cur = x.at?.[fmt] ?? { x: x.x, y: x.y, size: x.size };
        return { ...x, rot, at: { ...x.at, [fmt]: { ...cur, ...pos } } };
      }),
    }));

  const setText = (id: string, text: string, font?: string) => {
    const l = layout.layers.find((x) => x.id === id);
    if (!l) return;
    const f = font ?? l.font ?? "moderne";
    updateLayer(id, { text, font: f, ...shapeText(text.trim() ? text : "Texte", f) });
  };

  const addText = () => {
    const id = newKey();
    const text = "Ton texte";
    const n = layout.layers.filter((l) => l.kind === "text").length;
    const layerNew: ArtLayer = { id, kind: "text", text, font: "moderne", ...shapeText(text, "moderne"), color: "#FFFFFF", bg: null, size: 8, rot: 0, x: 0.5, y: [0.3, 0.38, 0.24, 0.42][n % 4] };
    setLayout((l) => ({ ...l, layers: [...l.layers, layerNew] }));
    setSelected(`layer:${id}`);
    setJustAdded(id);
  };

  const addIcon = (icon: string) => {
    const id = newKey();
    const n = layout.layers.filter((l) => l.kind === "icon").length;
    const layerNew: ArtLayer = { id, kind: "icon", icon, color: "#FFFFFF", bg: null, size: 14, rot: 0, x: [0.8, 0.2, 0.84, 0.16][n % 4], y: [0.3, 0.3, 0.4, 0.4][n % 4] };
    setLayout((l) => ({ ...l, layers: [...l.layers, layerNew] }));
    setSelected(`layer:${id}`);
  };

  const removeLayer = (id: string) => {
    setLayout((l) => ({ ...l, layers: l.layers.filter((x) => x.id !== id) }));
    setSelected(null);
  };

  const duplicateLayer = (id: string) => {
    const l = layout.layers.find((x) => x.id === id);
    if (!l) return;
    const copy: ArtLayer = { ...l, id: newKey(), x: clamp01(l.x + 0.05), y: clamp01(l.y + 0.05), at: undefined };
    setLayout((s) => ({ ...s, layers: [...s.layers, copy] }));
    setSelected(`layer:${copy.id}`);
  };

  const bringFront = (id: string) =>
    setLayout((l) => {
      const x = l.layers.find((y) => y.id === id);
      return x ? { ...l, layers: [...l.layers.filter((y) => y.id !== id), x] } : l;
    });

  const setSlot = (zone: FieldSlot, src: SlotSource) =>
    setLayout((l) => {
      const prev = l.slots?.[zone];
      return { ...l, slots: { ...l.slots, [zone]: { src, ...(src === "custom" && prev?.value ? { value: prev.value } : {}) } } };
    });
  const setSlotLabel = (zone: FieldSlot, label: string) =>
    setLayout((l) => ({ ...l, slots: { ...l.slots, [zone]: { ...(l.slots?.[zone] ?? { src: "custom" as const }), label } } }));
  const setSlotValue = (zone: FieldSlot | "foot", value: string) =>
    setLayout((l) =>
      zone === "foot"
        ? { ...l, slots: { ...l.slots, foot: { src: "custom", value } } }
        : { ...l, slots: { ...l.slots, [zone]: { ...(l.slots?.[zone] ?? { src: "custom" as const }), src: "custom", value } } },
    );
  const setFoot = (src: FootSource) => setLayout((l) => ({ ...l, slots: { ...l.slots, foot: { src, value: l.slots?.foot?.value } } }));

  /* ---------- Clavier : Suppr, flèches, Échap ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") setSelected(null);
      if (!layer) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeLayer(layer.id);
      }
      const step = e.shiftKey ? 0.05 : 0.01;
      const cur = format === "poster" ? layer : { ...layer, ...(layer.at?.[format] ?? {}) };
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        moveLayer(layer.id, { x: cur.x + moves[e.key][0], y: cur.y + moves[e.key][1] }, format);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hooks: CardEditorHooks = {
    selected,
    onSelect: setSelected,
    onLayerChange: moveLayer,
    onStampsMove: (y, fmt) => setLayout((l) => ({ ...l, stamps: { ...l.stamps, [fmt]: Math.round(y * 1000) / 1000 } })),
    onSlotLabel: setSlotLabel,
    onSlotValue: setSlotValue,
    onName: (name) => set({ name }),
    onProgramName: (program_name) => set({ program_name }),
    slotConfigs: layout.slots,
  };

  const hasStamps = v.mode !== "cashback";
  const tools: { id: string; icon: string; label: string; onClick: () => void; hidden?: boolean }[] = [
    { id: "photo", icon: "📷", label: "Photo", onClick: () => setSelected("photo") },
    { id: "colors", icon: "🎨", label: "Couleurs", onClick: () => setSelected("colors") },
    { id: "stamps", icon: "◎", label: "Tampons", onClick: () => setSelected("stamps"), hidden: !hasStamps },
    { id: "text", icon: "T", label: "Texte", onClick: addText },
    { id: "sticker", icon: "★", label: "Sticker", onClick: () => setSelected("sticker") },
    { id: "zones", icon: "▤", label: "Infos", onClick: () => setSelected("zones") },
  ];

  return (
    <div className="st-design">
      {/* ---------- Barre d'outils ---------- */}
      <div className="st-tools" role="toolbar" aria-label="Outils">
        {tools
          .filter((t) => !t.hidden)
          .map((t) => (
            <button key={t.id} type="button" onClick={t.onClick} className={`st-tool ${selected === t.id ? "st-tool-on" : ""}`}>
              <span className="st-tool-icon" aria-hidden="true">{t.icon}</span>
              <span>{t.id === "text" ? "+ Texte" : t.label}</span>
            </button>
          ))}
      </div>

      {/* ---------- La carte ---------- */}
      <div className="st-canvas" onClick={() => setSelected(null)}>
        <div className="st-platforms" role="tablist" aria-label="Téléphone" onClick={(e) => e.stopPropagation()}>
          {PLATFORMS.map((pl) => (
            <button key={pl.id} type="button" role="tab" aria-selected={platform === pl.id} title={pl.hint} onClick={() => setPlatform(pl.id)}>
              {pl.label}
            </button>
          ))}
        </div>
        <div className="st-card-holder">
          <CardPreview
            platform={platform}
            businessName={v.name}
            logoUrl={p.logoUrl}
            customerName="Marie"
            design={p.design}
            state={p.cardState}
            photoUrl={p.photo}
            progress={p.progress}
            slots={p.slots}
            editor={hooks}
          />
        </div>
        <div className="st-sim" onClick={(e) => e.stopPropagation()}>
          {v.mode === "stamps" && (
            <label className="flex items-center gap-3">
              <span className="st-hint whitespace-nowrap">Exemple : {Math.min(p.sampleFilled, v.reward_threshold)}/{v.reward_threshold}</span>
              <input type="range" min={0} max={v.reward_threshold} value={Math.min(p.sampleFilled, v.reward_threshold)} onChange={(e) => p.setSampleFilled(Number(e.target.value))} className="st-range" aria-label="Tampons sur la carte d'exemple" />
            </label>
          )}
          {v.tiers_enabled && p.tierRows.some((t) => t.name) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="st-hint">Niveau :</span>
              <button type="button" className={`st-chip ${p.previewTier === "" ? "st-chip-on" : ""}`} onClick={() => p.setPreviewTier("")}>Auto</button>
              {p.tierRows.filter((t) => t.name).map((t) => (
                <button key={t.key} type="button" className={`st-chip ${p.previewTier === t.key ? "st-chip-on" : ""}`} onClick={() => p.setPreviewTier(t.key)}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Panneau de réglages ---------- */}
      <aside ref={inspector} className="st-inspector" aria-live="polite">
        {!selected && (
          <div className="space-y-4">
            <h3 className="st-h3">Que veux-tu modifier ?</h3>
            <p className="st-hint">Clique directement sur la carte, ou choisis ici :</p>
            <div className="grid grid-cols-2 gap-2">
              {tools
                .filter((t) => !t.hidden)
                .map((t) => (
                  <button key={t.id} type="button" onClick={t.onClick} className="st-big-choice">
                    <span className="text-xl" aria-hidden="true">{t.icon}</span>
                    {t.id === "text" ? "Ajouter un texte" : t.id === "sticker" ? "Ajouter un sticker" : t.id === "zones" ? "Les infos de la carte" : t.label}
                  </button>
                ))}
            </div>
            <div className="st-tip">
              <b>Astuce :</b> les textes et stickers se déplacent au doigt ou à la souris. Le rond blanc les agrandit, le rond orange les fait tourner.
              Évite le milieu (QR code) et le bas de la carte (les infos), qui passent par-dessus la photo.
            </div>
          </div>
        )}

        {/* Photo */}
        {selected === "photo" && (
          <Panel title="📷 La photo" onClose={() => setSelected(null)}>
            <div className="st-photo-thumb">
              {p.stripUrl ? <img src={p.stripUrl} alt="Photo de la carte" /> : <span className="st-hint">Pas de photo : la carte utilise un dégradé de tes couleurs.</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="st-btn st-btn-soft" onClick={p.onPickPhoto}>{p.stripUrl ? "Changer la photo" : "Choisir une photo"}</button>
              {p.stripUrl && <button type="button" className="st-btn st-btn-ghost" onClick={p.onRemovePhoto}>Retirer</button>}
            </div>
            <p className="st-hint">Une vraie photo du commerce, nette et lumineuse (au moins 1600 px de large).</p>
            <div className="space-y-2">
              <span className="st-label">Partie de la photo à montrer</span>
              <Segmented value={v.photo_focus} onChange={(f) => set({ photo_focus: f })} label="Cadrage" options={[{ value: "top", label: "Le haut" }, { value: "center", label: "Le centre" }, { value: "bottom", label: "Le bas" }]} />
            </div>
            <label className="block space-y-2">
              <span className="st-label">Assombrir la photo : {v.strip_overlay} %</span>
              <input type="range" min={0} max={60} step={5} value={v.strip_overlay} onChange={(e) => set({ strip_overlay: Number(e.target.value) })} className="st-range" />
            </label>
            <button type="button" className="st-link" onClick={() => setSelected("colors")}>🎨 Changer les couleurs</button>
          </Panel>
        )}

        {/* Couleurs */}
        {selected === "colors" && (
          <Panel title="🎨 Les couleurs" onClose={() => setSelected(null)}>
            <span className="st-label">Ambiances prêtes</span>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="st-theme"
                  onClick={() => set({ background_color: t.background_color, foreground_color: t.foreground_color, label_color: t.label_color, stamp_color: t.stamp_color })}
                >
                  <span className="st-theme-dot" style={{ background: t.background_color, boxShadow: `inset 0 0 0 4px ${t.stamp_color}` }} />
                  {t.label}
                </button>
              ))}
            </div>
            <ColorPick label="Fond de la carte" value={v.background_color} onChange={(c) => set({ background_color: c })} />
            <ColorPick label="Textes" value={v.foreground_color} onChange={(c) => set({ foreground_color: c })} />
            <ColorPick label="Petits titres" value={v.label_color} onChange={(c) => set({ label_color: c })} />
            <ColorPick label="Couleur du cadeau et de la ligne du bas" value={v.stamp_color} onChange={(c) => set({ stamp_color: c })} />
          </Panel>
        )}

        {/* Tampons */}
        {selected === "stamps" && (
          <Panel title="◎ Les tampons" onClose={() => setSelected(null)}>
            {!hasStamps ? (
              <p className="st-hint">En cashback, pas de tampons : la cagnotte s&apos;affiche en texte.</p>
            ) : (
              <>
                {v.mode === "stamps" && (
                  <div className="space-y-2">
                    <span className="st-label">Nombre de cases</span>
                    <Stepper value={v.reward_threshold} onChange={(n) => set({ reward_threshold: n })} min={2} max={50} label="Nombre de cases" />
                  </div>
                )}
                <span className="st-label">Style</span>
                <div className="grid grid-cols-2 gap-2">
                  {PROGRESS_STYLES.map((ps) => (
                    <button key={ps.value} type="button" className={`st-option ${v.progress_style === ps.value ? "st-option-on" : ""}`} onClick={() => set({ progress_style: ps.value })}>
                      <b>{ps.title}</b>
                      <span className="st-hint">{ps.text}</span>
                    </button>
                  ))}
                </div>
                {!PROGRESS_STYLES.some((ps) => ps.value === v.progress_style) && <p className="st-warn">Cette carte utilise un ancien style. Choisis un style ci-dessus.</p>}
                {(v.progress_style === "glass" || v.progress_style === "minimal") && (
                  <div className="st-tip">
                    ↕️ Fais glisser la bande de tampons sur la carte pour la monter ou la descendre.
                    {layout.stamps?.[format] !== undefined && (
                      <button
                        type="button"
                        className="st-link ml-1"
                        onClick={() =>
                          setLayout((l) => {
                            const stamps = { ...l.stamps };
                            delete stamps[format];
                            return { ...l, stamps };
                          })
                        }
                      >
                        Remettre à sa place
                      </button>
                    )}
                  </div>
                )}
                {v.progress_style === "glass" && (
                  <div className="space-y-2">
                    <span className="st-label">Icônes des cases (dans l&apos;ordre)</span>
                    <div className="grid grid-cols-6 gap-1.5">
                      {Object.keys(LINE_ICON_LABELS)
                        .filter((id) => id !== "gift")
                        .map((id) => {
                          const pos = p.collection.indexOf(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              title={LINE_ICON_LABELS[id]}
                              aria-pressed={pos >= 0}
                              onClick={() => p.setCollection(pos >= 0 ? p.collection.filter((x) => x !== id) : [...p.collection, id].slice(0, 8))}
                              className={`st-icon-pick ${pos >= 0 ? "st-icon-pick-on" : ""}`}
                            >
                              <IconGlyph id={id} />
                              {pos >= 0 && <span className="st-icon-pick-num">{pos + 1}</span>}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
                {v.mode === "stamps" && v.progress_style !== "none" && (
                  <Toggle checked={v.reward_on_last} onChange={(on) => set({ reward_on_last: on })} label="La dernière case montre le cadeau 🎁" />
                )}
              </>
            )}
          </Panel>
        )}

        {/* Sticker */}
        {selected === "sticker" && (
          <Panel title="★ Ajouter un sticker" onClose={() => setSelected(null)}>
            <p className="st-hint">Clique sur un dessin pour le poser sur la photo.</p>
            <div className="grid grid-cols-5 gap-2">
              {ICON_IDS.map((id) => (
                <button key={id} type="button" title={LINE_ICON_LABELS[id] ?? id} className="st-icon-pick" onClick={() => addIcon(id)}>
                  <IconGlyph id={id} size={24} />
                </button>
              ))}
            </div>
          </Panel>
        )}

        {/* Toutes les zones */}
        {selected === "zones" && (
          <Panel title="▤ Les infos de la carte" onClose={() => setSelected(null)}>
            <p className="st-hint">Apple et Google placent ces infos. Toi, tu choisis ce qui va dans chaque zone.</p>
            {FIELD_SLOTS.map((z) => (
              <div key={z} className="space-y-1.5">
                <button type="button" className="st-link font-semibold" onClick={() => setSelected(z)}>{ZONE_TITLES[z]}</button>
                <SourcePicker value={layout.slots?.[z]?.src ?? "none"} features={features} onChange={(src) => setSlot(z, src)} compact />
              </div>
            ))}
            <button
              type="button"
              className="st-btn st-btn-ghost w-full"
              onClick={() => setLayout((l) => ({ ...l, slots: defaultSlots(features) }))}
            >
              ↺ Disposition conseillée
            </button>
          </Panel>
        )}

        {/* Une zone de texte */}
        {selected && (FIELD_SLOTS as readonly string[]).includes(selected) && (
          <ZonePanel
            zone={selected as FieldSlot}
            layout={layout}
            features={features}
            onSource={(src) => setSlot(selected as FieldSlot, src)}
            onLabel={(label) => setSlotLabel(selected as FieldSlot, label)}
            onValue={(value) => setSlotValue(selected as FieldSlot, value)}
            onClose={() => setSelected(null)}
            platform={platform}
          />
        )}

        {/* Ligne du bas */}
        {selected === "foot" && (
          <Panel title="Ligne du bas" onClose={() => setSelected(null)}>
            <p className="st-hint">Visible sur l&apos;iPhone récent, sous les champs.</p>
            <Segmented
              value={layout.slots?.foot?.src ?? "sentence"}
              onChange={setFoot}
              label="Contenu de la ligne du bas"
              options={[
                { value: "sentence", label: "Progression" },
                { value: "custom", label: "Mon message" },
                { value: "none", label: "Vide" },
              ]}
            />
            {layout.slots?.foot?.src === "sentence" || !layout.slots?.foot ? (
              <p className="st-hint">Ex : « Plus que 7 passages avant ton cadeau ». Elle change toute seule.</p>
            ) : layout.slots?.foot?.src === "custom" ? (
              <input className="st-input" maxLength={90} value={layout.slots.foot.value ?? ""} onChange={(e) => setSlotValue("foot", e.target.value)} placeholder="Ex : Merci de ta fidélité 🌴" />
            ) : null}
          </Panel>
        )}

        {/* Logo */}
        {selected === "logo" && (
          <Panel title="Logo et nom" onClose={() => setSelected(null)}>
            <div className="st-photo-thumb st-photo-thumb-sm">{p.logoUrl ? <img src={p.logoUrl} alt="Logo" /> : <span className="st-hint">Pas de logo : la première lettre du nom est utilisée.</span>}</div>
            <button type="button" className="st-btn st-btn-soft" onClick={p.onPickLogo}>{p.logoUrl ? "Changer le logo" : "Choisir un logo"}</button>
            <label className="block space-y-1.5">
              <span className="st-label">Nom du commerce</span>
              <input className="st-input" value={v.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <Toggle checked={v.show_logo_text} onChange={(on) => set({ show_logo_text: on })} label="Afficher le nom à côté du logo" hint="Décoche si ton logo contient déjà le nom." />
          </Panel>
        )}

        {/* Titre Android */}
        {selected === "title" && (
          <Panel title="Nom de la carte" onClose={() => setSelected(null)}>
            <input className="st-input st-input-lg" value={v.program_name} maxLength={40} onChange={(e) => set({ program_name: e.target.value })} />
            <p className="st-hint">C&apos;est le grand titre sur Android, et le nom de la carte partout ailleurs.</p>
          </Panel>
        )}

        {/* QR code */}
        {selected === "qr" && (
          <Panel title="QR code" onClose={() => setSelected(null)}>
            <p className="st-hint">Apple et Google placent le QR code eux-mêmes : il ne bouge pas. Il contient le numéro unique du client, que le commerçant scanne pour ajouter les tampons.</p>
          </Panel>
        )}

        {/* Calque sélectionné */}
        {layer && (
          <Panel title={layer.kind === "text" ? "T Texte" : "★ Sticker"} onClose={() => setSelected(null)}>
            {layer.kind === "text" ? (
              <>
                <textarea
                  className="st-input st-input-lg"
                  rows={2}
                  maxLength={80}
                  value={layer.text ?? ""}
                  onChange={(e) => setText(layer.id, e.target.value.split("\n").slice(0, 3).join("\n"))}
                  aria-label="Texte"
                  autoFocus={justAdded === layer.id}
                  onFocus={(e) => {
                    if (justAdded === layer.id) {
                      e.currentTarget.select();
                      setJustAdded(null);
                    }
                  }}
                />
                <span className="st-label">Police</span>
                <div className="grid grid-cols-2 gap-2">
                  {FONT_CHOICES.map((f) => (
                    <button key={f.id} type="button" className={`st-option st-option-row ${layer.font === f.id ? "st-option-on" : ""}`} onClick={() => setText(layer.id, layer.text ?? "Texte", f.id)}>
                      <FontSample id={f.id} />
                      <span className="text-sm">{f.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span className="st-label">Dessin</span>
                <div className="grid grid-cols-6 gap-1.5">
                  {ICON_IDS.map((id) => (
                    <button key={id} type="button" title={LINE_ICON_LABELS[id] ?? id} aria-pressed={layer.icon === id} className={`st-icon-pick ${layer.icon === id ? "st-icon-pick-on" : ""}`} onClick={() => updateLayer(layer.id, { icon: id })}>
                      <IconGlyph id={id} size={20} />
                    </button>
                  ))}
                </div>
              </>
            )}
            <ColorPick label="Couleur" value={layer.color} onChange={(c) => updateLayer(layer.id, { color: c })} />
            <div className="space-y-2">
              <Toggle
                checked={!!layer.bg}
                onChange={(on) => updateLayer(layer.id, { bg: on ? (layer.color.toLowerCase() === "#ffffff" ? v.background_color : "#FFFFFF") : null })}
                label={layer.kind === "text" ? "Pastille derrière le texte" : "Rond derrière le dessin"}
              />
              {layer.bg && <ColorPick label="Couleur du fond" value={layer.bg} onChange={(c) => updateLayer(layer.id, { bg: c })} />}
            </div>
            <label className="block space-y-2">
              <span className="st-label">Taille</span>
              <input
                type="range"
                min={2}
                max={layer.kind === "text" ? 24 : 40}
                step={0.5}
                value={format === "poster" ? layer.size : (layer.at?.[format]?.size ?? layer.size)}
                onChange={(e) => moveLayer(layer.id, { size: Number(e.target.value) }, format)}
                className="st-range"
              />
            </label>
            <label className="block space-y-2">
              <span className="st-label">Rotation : {layer.rot}°</span>
              <input type="range" min={-180} max={180} step={1} value={layer.rot} onChange={(e) => moveLayer(layer.id, { rot: Number(e.target.value) }, format)} className="st-range" />
            </label>
            {format !== "poster" && (
              <div className="st-tip">
                Sur ce téléphone, la photo est plus petite : la position et la taille sont propres à ce format.
                {layer.at?.[format] && (
                  <button
                    type="button"
                    className="st-link ml-1"
                    onClick={() => {
                      const at = { ...layer.at };
                      delete at[format as "apple" | "google"];
                      updateLayer(layer.id, { at: Object.keys(at).length ? at : undefined });
                    }}
                  >
                    Recaler comme sur l&apos;iPhone récent
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="st-btn st-btn-ghost" onClick={() => moveLayer(layer.id, { x: 0.5 }, format)}>↔ Centrer</button>
              <button type="button" className="st-btn st-btn-ghost" onClick={() => bringFront(layer.id)}>⬆ Devant</button>
              <button type="button" className="st-btn st-btn-ghost" onClick={() => duplicateLayer(layer.id)}>⧉ Dupliquer</button>
              <button type="button" className="st-btn st-btn-danger" onClick={() => removeLayer(layer.id)}>🗑 Supprimer</button>
            </div>
          </Panel>
        )}
      </aside>
    </div>
  );
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="st-h3">{title}</h3>
        <button type="button" className="st-icon-btn" aria-label="Fermer" onClick={onClose}>✕</button>
      </div>
      {children}
    </div>
  );
}

function SourcePicker({
  value,
  onChange,
  features,
  compact,
}: {
  value: SlotSource;
  onChange: (src: SlotSource) => void;
  features: { tiers: boolean; streak: boolean; lap: boolean };
  compact?: boolean;
}) {
  const list = SLOT_SOURCES.filter((s) => !s.needs || features[s.needs] || s.src === value);
  return (
    <div className={`grid gap-1.5 ${compact ? "grid-cols-3" : "grid-cols-2"}`} role="radiogroup">
      {list.map((s) => (
        <button key={s.src} type="button" role="radio" aria-checked={value === s.src} title={s.hint} className={`st-option ${compact ? "st-option-xs" : ""} ${value === s.src ? "st-option-on" : ""}`} onClick={() => onChange(s.src)}>
          <b>{s.label}</b>
          {!compact && <span className="st-hint">{s.hint}</span>}
        </button>
      ))}
    </div>
  );
}

function ZonePanel({
  zone,
  layout,
  features,
  onSource,
  onLabel,
  onValue,
  onClose,
  platform,
}: {
  zone: FieldSlot;
  layout: CardLayout;
  features: { tiers: boolean; streak: boolean; lap: boolean };
  onSource: (src: SlotSource) => void;
  onLabel: (label: string) => void;
  onValue: (value: string) => void;
  onClose: () => void;
  platform: Platform;
}) {
  const cfg = layout.slots?.[zone] ?? { src: "none" as SlotSource };
  const needs = SLOT_SOURCES.find((s) => s.src === cfg.src)?.needs;
  const where =
    zone === "top"
      ? "En haut à droite sur iPhone, à gauche sous le titre sur Android."
      : zone === "b1" || zone === "b2"
        ? platform === "google"
          ? "Sur Android, seul le premier champ rempli est affiché (à droite)."
          : "En bas de la carte."
        : "En bas de la carte (iPhone).";
  return (
    <Panel title={ZONE_TITLES[zone]} onClose={onClose}>
      <p className="st-hint">{where}</p>
      <span className="st-label">Que mettre ici ?</span>
      <SourcePicker value={cfg.src} onChange={onSource} features={features} />
      {needs && !features[needs] && <p className="st-warn">Cette info n&apos;existe pas encore : active-la à l&apos;étape 4.</p>}
      {cfg.src !== "none" && (
        <label className="block space-y-1.5">
          <span className="st-label">Petit titre (au-dessus)</span>
          <input className="st-input" maxLength={20} value={cfg.label ?? ""} onChange={(e) => onLabel(e.target.value)} placeholder="Laisse vide pour le titre automatique" />
        </label>
      )}
      {cfg.src === "custom" && (
        <label className="block space-y-1.5">
          <span className="st-label">Ton texte</span>
          <input className="st-input" maxLength={40} value={cfg.value ?? ""} onChange={(e) => onValue(e.target.value)} placeholder="Ex : Membre VIP" />
        </label>
      )}
      <p className="st-tip">Tu peux aussi écrire directement sur la carte : le titre devient modifiable quand la zone est sélectionnée.</p>
    </Panel>
  );
}
