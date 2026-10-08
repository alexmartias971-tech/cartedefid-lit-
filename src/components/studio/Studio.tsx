"use client";

import { startTransition, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveBusiness, type FormState } from "@/app/admin/actions";
import type { ArtFormat, CardLayout } from "@/lib/layout";
import type { Business, CatalogReward, Program, Tier } from "@/lib/types";
import { useImageRatio } from "@/lib/use-image-ratio";
import { TRADES } from "./content";
import { manrope, unbounded } from "./fonts";
import { dominantColors, removeWhiteBackground, trimTransparent, upload } from "./images";
import { centerLayer, logoLayer, moveLayer, removeLayer, setCrop, setStampsY, updateLayer } from "./layers";
import { conflictMessage, conflicts, keepOthersClear, layerName } from "./overlap";
import { usePreview, type Moment } from "./preview";
import Stage from "./Stage";
import { applyTrade, emptyImage, initialDraft, initialImages, missing, promise, toFormData, type Draft, type ImageSlot, type Images } from "./state";
import StepCommerce from "./StepCommerce";
import StepExtras from "./StepExtras";
import StepLook, { type Tool } from "./StepLook";
import StepReview from "./StepReview";
import StepReward from "./StepReward";

type Props = { business?: Business; program?: Program; tiers?: Tier[]; catalog?: CatalogReward[] };

const STEPS = [
  { title: "Votre commerce", short: "Commerce" },
  { title: "La récompense", short: "Récompense" },
  { title: "Le look", short: "Look" },
  { title: "Infos et bonus", short: "Bonus" },
  { title: "Vérifier et publier", short: "Publier" },
];

/** Champs qui changent la promesse affichée en titre (tant que le titre est automatique). */
const PROMISE_KEYS: (keyof Draft)[] = ["mode", "reward_description", "reward_threshold", "points_per_euro", "cashback_percent"];

/** Éditeur de carte Walty : 5 étapes, la carte toujours visible à droite. */
export default function Studio({ business, program, tiers = [], catalog = [] }: Props) {
  const isNew = !business;
  const [state, dispatch, pending] = useActionState<FormState, FormData>(saveBusiness, {});
  const [d, setDraft] = useState<Draft>(() => initialDraft(business, program, tiers, catalog));
  const [images, setImages] = useState<Images>(() => initialImages(business, program));
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<ArtFormat>("poster");
  const [compare, setCompare] = useState(false);
  const [moment, setMoment] = useState<Moment>("half");
  const [forcedTier, setForcedTier] = useState("");
  const [tool, setTool] = useState<Tool>("fond");
  const [selected, setSelected] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  /** Après l'ajout d'un logo : question « le nom est-il écrit dessus ? » et retour possible au fond blanc. */
  const [logoInfo, setLogoInfo] = useState<{ ask: boolean; original: File | null }>({ ask: false, original: null });
  const [logoColors, setLogoColors] = useState<string[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const [previewHidden, setPreviewHidden] = useState(false);

  /* ---------- Historique : Annuler / Rétablir (un glisser compte pour une seule étape ; les images aussi) ---------- */
  const dRef = useRef(d);
  const imRef = useRef(images);
  useEffect(() => {
    dRef.current = d;
    imRef.current = images;
  }, [d, images]);
  type Snap = { d: Draft; images: Images };
  const history = useRef<{ past: Snap[]; future: Snap[]; last: number }>({ past: [], future: [], last: 0 });
  /** Ce qu'on peut annuler / rétablir (pour activer les boutons). */
  const [canUndo, setCanUndo] = useState({ past: false, future: false });
  const setHistoryTick = useCallback((_: unknown) => {
    void _;
    setCanUndo({ past: history.current.past.length > 0, future: history.current.future.length > 0 });
  }, []);
  const remember = useCallback(() => {
    const h = history.current;
    const now = performance.now();
    if (now - h.last > 700) {
      h.past.push({ d: dRef.current, images: imRef.current });
      if (h.past.length > 80) h.past.shift();
      h.future = [];
      setHistoryTick(0);
    }
    h.last = now;
  }, [setHistoryTick]);
  /** Revenir à un état : une image encore en cours d'envoi à ce moment-là n'est pas reprise (elle resterait bloquée). */
  const restore = useCallback((snap: Snap) => {
    const now = { d: dRef.current, images: imRef.current };
    const slot = (old: ImageSlot | undefined, cur: ImageSlot | undefined) => (old?.uploading ? cur : old);
    const bg: Images["bg"] = {};
    for (const f of new Set([...Object.keys(snap.images.bg), ...Object.keys(now.images.bg)]) as Set<ArtFormat>) {
      const s = slot(snap.images.bg[f], now.images.bg[f]);
      if (s) bg[f] = s;
    }
    setImages({ ...snap.images, logo: slot(snap.images.logo, now.images.logo)!, strip: slot(snap.images.strip, now.images.strip)!, bg });
    // Photos des niveaux : on garde celles d'aujourd'hui (leur envoi a pu se terminer depuis)
    setDraft({
      ...snap.d,
      tiers: snap.d.tiers.map((t) => {
        const cur = now.d.tiers.find((x) => x.key === t.key);
        if (cur) return { ...t, image: cur.image };
        return t.image.uploading ? { ...t, image: { ...t.image, preview: t.image.saved, remote: t.image.saved, uploading: false } } : t;
      }),
    });
  }, []);
  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push({ d: dRef.current, images: imRef.current });
    h.last = 0;
    restore(prev);
    setHistoryTick(0);
  }, [setHistoryTick, restore]);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push({ d: dRef.current, images: imRef.current });
    h.last = 0;
    restore(next);
    setHistoryTick(0);
  }, [setHistoryTick, restore]);

  /* ---------- Modifications ---------- */
  const set = useCallback((patch: Partial<Draft>) => {
    remember();
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (next.titleAuto && PROMISE_KEYS.some((k) => k in patch)) next.program_name = promise(next);
      return next;
    });
  }, [remember]);
  const ratioRef = useRef<number | null>(null);
  const updateLayout = useCallback(
    (fn: (l: CardLayout) => CardLayout) => {
      remember();
      // Un déplacement fait sur l'iPhone à jour entraîne les autres téléphones, sauf s'il y cacherait les tampons
      setDraft((prev) => ({ ...prev, layout: keepOthersClear(prev, prev.layout, fn(prev.layout), ratioRef.current) }));
    },
    [remember],
  );

  /* ---------- Images : aperçu immédiat, envoi en arrière-plan ---------- */
  const sendImage = useCallback(
    async (file: File, kind: "logo" | "strip" | "bg" | "tier", apply: (fn: (s: ImageSlot) => ImageSlot) => void) => {
      if (file.size > 15 * 1024 * 1024) {
        apply((s) => ({ ...s, uploading: false, error: "Image trop lourde (15 Mo maximum)." }));
        return;
      }
      const preview = URL.createObjectURL(file);
      apply((s) => ({ preview, remote: null, uploading: true, error: null, saved: s.saved }));
      const res = await upload(file, kind, business?.id);
      apply((s) => {
        if (s.preview !== preview) return s; // une autre image a été choisie entre-temps
        // Échec : on revient à la dernière image valide (rien n'est perdu à l'enregistrement)
        if (!res.url && res.error) return { preview: s.saved, remote: s.saved, uploading: false, error: res.error, saved: s.saved };
        return { preview, remote: res.url ?? null, uploading: false, error: null, saved: res.url ?? s.saved };
      });
    },
    [business?.id],
  );
  const logoPick = useRef(0);
  const pickLogo = async (f: File, keepWhite = false) => {
    const ticket = ++logoPick.current;
    const first = !imRef.current.logo.saved && !keepWhite;
    remember();
    setImages((im) => ({ ...im, logo: { ...im.logo, uploading: true, error: null } }));
    // Logo sur fond blanc (JPG, capture…) : le fond est retiré automatiquement, on peut revenir en arrière.
    // Logo déjà transparent : on retire seulement ses marges vides (l'aperçu et la carte partent de la même image).
    const cleaned = keepWhite ? null : await removeWhiteBackground(f);
    const trimmed = cleaned || keepWhite ? null : await trimTransparent(f);
    if (ticket !== logoPick.current) return; // un autre logo a été choisi entre-temps
    setLogoInfo({ ask: true, original: cleaned ? f : null });
    void sendImage(cleaned ?? trimmed ?? f, "logo", (fn) => setImages((im) => ({ ...im, logo: fn(im.logo) })));
    // Tout premier logo de la carte : il se pose en grand, déjà sélectionné (poignées visibles pour l'agrandir).
    // Remplacer un logo existant ne change rien à la carte.
    if (first && !dRef.current.layout.layers.some((l) => l.kind === "logo")) {
      const layer = logoLayer();
      updateLayout((l) => (l.layers.some((x) => x.kind === "logo") ? l : { ...l, layers: [layer, ...l.layers] }));
      setSelected(`layer:${layer.id}`);
    }
  };
  const removeLogo = () => {
    remember();
    setLogoInfo({ ask: false, original: null });
    setLogoColors([]);
    logoPick.current++;
    setImages((im) => ({ ...im, logo: emptyImage() }));
    setDraft((prev) => ({
      ...prev,
      show_logo_text: true,
      layout: { ...prev.layout, topLogo: undefined, look: prev.layout.look === "logo" ? "classic" : prev.layout.look, layers: prev.layout.layers.filter((l) => l.kind !== "logo") },
    }));
  };
  const pickStrip = (f: File) => {
    remember();
    void sendImage(f, "strip", (fn) => setImages((im) => ({ ...im, strip: fn(im.strip) })));
  };
  const removeStrip = () => {
    remember();
    setImages((im) => ({ ...im, strip: emptyImage() }));
  };
  const pickBg = (fmt: ArtFormat, f: File) => {
    remember();
    void sendImage(f, "bg", (fn) => setImages((im) => ({ ...im, bg: { ...im.bg, [fmt]: fn(im.bg[fmt] ?? emptyImage()) } })));
  };
  const removeBg = (fmt: ArtFormat) => {
    remember();
    setImages((im) => {
      const bg = { ...im.bg };
      delete bg[fmt];
      return { ...im, bg };
    });
    updateLayout((l) => setCrop(l, fmt, null));
  };
  const pickTierImage = (key: string, f: File) =>
    void sendImage(f, "tier", (fn) => setDraft((prev) => ({ ...prev, tiers: prev.tiers.map((t) => (t.key === key ? { ...t, image: fn(t.image) } : t)) })));

  const logoOnArt = d.layout.layers.some((l) => l.kind === "logo");
  const logoL = d.layout.layers.find((l) => l.kind === "logo") ?? null;
  const logoSize = logoL ? (platform === "poster" ? logoL.size : (logoL.at?.[platform]?.size ?? logoL.size)) : null;
  const setLogoOnArt = (on: boolean) =>
    updateLayout((l) => (on ? (l.layers.some((x) => x.kind === "logo") ? l : { ...l, layers: [logoLayer(), ...l.layers] }) : { ...l, layers: l.layers.filter((x) => x.kind !== "logo") }));

  const chooseTrade = (id: string) => {
    const t = TRADES.find((x) => x.id === id);
    if (!t) return;
    remember();
    setDraft((prev) => applyTrade(prev, t));
  };

  // Couleurs tirées du logo (proposées dans l'outil « Couleurs »)
  useEffect(() => {
    const url = images.logo.preview;
    if (!url) return;
    let alive = true;
    dominantColors(url).then((c) => alive && setLogoColors(c));
    return () => {
      alive = false;
    };
  }, [images.logo.preview]);

  /* ---------- Aperçu ---------- */
  const pv = usePreview(d, images, moment, forcedTier);
  const photoRatio = useImageRatio(images.bg[platform]?.preview || images.strip.preview);
  const logoRatio = useImageRatio(images.logo.preview);
  useEffect(() => {
    ratioRef.current = logoRatio;
  }, [logoRatio]);
  // Logo ou élément qui cache les tampons ou le QR code, sur l'un des 3 téléphones
  const logoWarnings = conflicts(d, logoL, logoRatio, platform).map((c) => conflictMessage(c, platform, "Le logo"));
  const artWarnings = d.layout.layers.flatMap((l) => conflicts(d, l, logoRatio).map((c) => conflictMessage(c, "poster", layerName(l)).replace(" sur l'iPhone à jour", "")));

  const onSelect = (zone: string | null) => {
    // Clic sur la photo alors qu'un élément est sélectionné : on le désélectionne simplement
    if (zone === "photo" && step === 2 && selected?.startsWith("layer:")) {
      setSelected(null);
      return;
    }
    setSelected(zone);
    if (!zone) return;
    const isLogoLayer = zone.startsWith("layer:") && d.layout.layers.find((l) => `layer:${l.id}` === zone)?.kind === "logo";
    if (step !== 2) {
      // Hors de l'étape « Le look », un clic sur la carte mène au bon réglage (le logo se règle aussi à l'étape 1, sur place)
      if (zone === "logo" || (isLogoLayer && step === 0)) setStep(0);
      else setStep(2);
    }
    const map: Record<string, Tool> = { photo: "fond", logo: "logo", stamps: "tampons", infos: "infos", message: "infos", title: "infos" };
    if (map[zone]) setTool(map[zone]);
    if (zone.startsWith("layer:")) {
      const layer = d.layout.layers.find((l) => `layer:${l.id}` === zone);
      setTool(layer?.kind === "logo" ? "logo" : "decor");
    }
  };

  const editor = {
    selected,
    onSelect,
    onLayerChange: (id: string, change: { x?: number; y?: number; size?: number; rot?: number }, fmt: ArtFormat) => updateLayout((l) => moveLayer(l, id, change, fmt)),
    onStampsMove: (y: number, fmt: ArtFormat) => updateLayout((l) => setStampsY(l, fmt, y)),
    panPhoto: step === 2 && tool === "fond",
    onCropChange: (fmt: ArtFormat, crop: { x: number; y: number; zoom: number }) => updateLayout((l) => setCrop(l, fmt, crop)),
  };

  /* ---------- Clavier : Suppr, flèches, Échap (sur la carte) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") setSelected(null);
      const id = selected?.startsWith("layer:") ? selected.slice(6) : null;
      const layer = id ? d.layout.layers.find((l) => l.id === id) : null;
      if (!layer) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        updateLayout((l) => removeLayer(l, layer.id));
        setSelected(null);
        return;
      }
      const delta = e.shiftKey ? 0.05 : 0.01;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
      if (moves[e.key]) {
        e.preventDefault();
        const cur = platform === "poster" ? layer : { ...layer, ...(layer.at?.[platform] ?? {}) };
        updateLayout((l) => moveLayer(l, layer.id, { x: cur.x + moves[e.key][0], y: cur.y + moves[e.key][1] }, platform));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, d.layout.layers, platform, updateLayout, undo, redo]);

  /* ---------- Vérifications et enregistrement ---------- */
  const problems = useMemo(() => missing(d, images), [d, images]);
  const error = (field: string) => (showErrors ? (problems.find((p) => p.field === field)?.message ?? null) : null);
  const stepOk = (i: number) => !problems.some((p) => p.step === i);

  // État de référence pour « modifications non enregistrées » (sans les identifiants reçus après l'enregistrement)
  const snapshot = JSON.stringify({
    d: { ...d, tiers: d.tiers.map((t) => ({ ...t, id: undefined })), catalog: d.catalog.map((r) => ({ ...r, id: undefined })) },
    logo: images.logo.remote,
    strip: images.strip.remote,
    bg: Object.fromEntries(Object.entries(images.bg).map(([k, v]) => [k, v?.remote])),
  });
  const [saved, setSaved] = useState(snapshot);
  const savedIds = useRef(new Map<string, string>());
  useEffect(() => {
    for (const x of state.saved?.tiers ?? []) savedIds.current.set(`t:${x.key}`, x.id);
    for (const x of state.saved?.catalog ?? []) savedIds.current.set(`c:${x.key}`, x.id);
  }, [state]);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.saved) {
      // Les niveaux et cadeaux créés reçoivent leur identifiant : le prochain enregistrement les met à jour au lieu de les recréer
      const ids = state.saved;
      setDraft((prev) => ({
        ...prev,
        tiers: prev.tiers.map((t) => (t.id ? t : { ...t, id: ids.tiers.find((x) => x.key === t.key)?.id })),
        catalog: prev.catalog.map((r) => (r.id ? r : { ...r, id: ids.catalog.find((x) => x.key === r.key)?.id })),
      }));
    }
    if (state.ok) setSaved(snapshot);
  }
  const dirty = snapshot !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () => {
    setShowErrors(true);
    const blocking = problems.filter((p) => p.step >= 0);
    if (blocking.length > 0) {
      setStep(blocking[0].step);
      return;
    }
    if (problems.length > 0) return; // image en cours d'envoi
    // Carte déjà utilisée : on prévient avant de changer les règles pour les clients en cours
    if (program && (program.mode !== d.mode || program.reward_threshold !== d.reward_threshold || program.reward_description !== d.reward_description.trim())) {
      const ok = window.confirm(
        "Vous changez la règle de la carte (cadeau, nombre de tampons ou façon de gagner).\n\nLes cartes de vos clients seront mises à jour dès l'enregistrement, avec ce qu'ils ont déjà gagné. Vos clients sur iPhone recevront une notification avec la nouvelle règle.\n\nContinuer ?",
      );
      if (!ok) return;
    }
    // Niveaux et cadeaux déjà créés en base : on renvoie leur identifiant (même après un « Annuler »)
    const ids = savedIds.current;
    const withIds: Draft = {
      ...d,
      tiers: d.tiers.map((t) => (t.id ? t : { ...t, id: ids.get(`t:${t.key}`) })),
      catalog: d.catalog.map((r) => (r.id ? r : { ...r, id: ids.get(`c:${r.key}`) })),
    };
    startTransition(() => dispatch(toFormData(withIds, images, business?.id)));
  };

  const go = (i: number) => {
    setStep(i);
    setSelected(null);
    if (i === 4) setCompare(true);
    else if (step === 4) setCompare(false);
    panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const uploading = problems.some((p) => p.field === "upload");
  const status = state.error ? (
    <span className="wz-bar-error" role="alert">⚠ {state.error}</span>
  ) : uploading ? (
    <span className="wz-hint">Envoi de l&apos;image…</span>
  ) : state.ok && !dirty ? (
    <span className="wz-bar-ok">✓ {state.ok}</span>
  ) : dirty && !isNew ? (
    <span className="wz-hint">Modifications non enregistrées</span>
  ) : (
    <span className="wz-hint">Étape {step + 1} sur {STEPS.length}</span>
  );

  return (
    <div className={`wz ${unbounded.variable} ${manrope.variable}`}>
      <header className="wz-head">
        <div className="wz-title">
          <span className="wz-kicker">{isNew ? "Nouvelle carte" : "Modifier la carte"}</span>
          <h2 className="wz-h2">{d.name.trim() || (isNew ? "Créer votre carte de fidélité" : "Votre carte")}</h2>
        </div>
        <nav className="wz-steps" aria-label="Étapes">
          {STEPS.map((s, i) => {
            const ok = stepOk(i);
            const visited = !isNew || i <= step;
            return (
              <button
                key={s.title}
                type="button"
                onClick={() => go(i)}
                aria-current={step === i ? "step" : undefined}
                className={`wz-step-btn ${step === i ? "wz-step-on" : ""} ${visited && ok && i !== step && i < 4 ? "wz-step-done" : ""} ${showErrors && !ok ? "wz-step-todo" : ""}`}
              >
                <span className="wz-step-num">{showErrors && !ok ? "!" : visited && ok && i !== step && i < 4 ? "✓" : i + 1}</span>
                <span className="wz-step-label">
                  <span className="hidden md:inline">{s.title}</span>
                  <span className="md:hidden">{s.short}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      <div className={`wz-main ${step === 4 ? "wz-main-review" : ""}`}>
        <div className="wz-panel" ref={panel}>
          {step === 0 && (
            <StepCommerce
              d={d}
              set={set}
              images={images}
              pickLogo={(f) => void pickLogo(f)}
              removeLogo={removeLogo}
              chooseTrade={chooseTrade}
              isNew={isNew}
              logoOnArt={logoOnArt}
              setLogoOnArt={setLogoOnArt}
              error={error}
              logoInfo={logoInfo}
              answerName={(written) => {
                set({ show_logo_text: !written });
                setLogoInfo((li) => ({ ...li, ask: false }));
              }}
              keepWhite={() => logoInfo.original && void pickLogo(logoInfo.original, true)}
              logoSize={logoSize}
              setLogoSize={(n) => logoL && updateLayout((l) => moveLayer(l, logoL.id, { size: n }, platform))}
              centerLogo={() => logoL && updateLayout((l) => centerLayer(l, logoL.id, platform))}
              logoBg={!!logoL?.bg}
              setLogoBg={(on) => logoL && updateLayout((l) => updateLayer(l, logoL.id, { bg: on ? "#FFFFFF" : null }))}
              hasPhoto={!!(images.strip.preview || images.bg[platform]?.preview)}
              logoWarnings={logoWarnings}
            />
          )}
          {step === 1 && <StepReward d={d} set={set} error={error} />}
          {step === 2 && (
            <StepLook
              d={d}
              set={set}
              updateLayout={updateLayout}
              images={images}
              platform={platform}
              tool={tool}
              setTool={setTool}
              selected={selected}
              setSelected={setSelected}
              pickStrip={pickStrip}
              removeStrip={removeStrip}
              pickBg={pickBg}
              removeBg={removeBg}
              pickLogo={(f) => void pickLogo(f)}
              logoOnArt={logoOnArt}
              setLogoOnArt={setLogoOnArt}
              photoRatio={photoRatio}
              logoColors={logoColors}
              logoRatio={logoRatio}
            />
          )}
          {step === 3 && <StepExtras d={d} set={set} pickTierImage={pickTierImage} error={error} />}
          {step === 4 && <StepReview d={d} business={business} problems={problems} goTo={go} warnings={artWarnings} />}
        </div>

        <aside className={`wz-aside ${previewHidden ? "wz-aside-hidden" : ""}`} aria-label="Aperçu de la carte">
          <button type="button" className="wz-preview-toggle" onClick={() => setPreviewHidden(!previewHidden)} aria-expanded={!previewHidden}>
            {previewHidden ? "▾ Voir la carte" : "▴ Réduire l'aperçu"}
          </button>
          <Stage
            d={d}
            images={images}
            pv={pv}
            platform={platform}
            setPlatform={setPlatform}
            compare={compare}
            setCompare={setCompare}
            moment={moment}
            setMoment={setMoment}
            forcedTier={forcedTier}
            setForcedTier={setForcedTier}
            editor={editor}
            note={step === 2 && tool === "fond" && (images.bg[platform]?.preview || images.strip.preview) ? <p className="wz-stage-note">✋ Glissez la photo pour la recadrer sur ce téléphone.</p> : null}
          />
        </aside>
      </div>

      <div className="wz-bar">
        <div className="wz-bar-msg" aria-live="polite">{status}</div>
        <div className="wz-bar-actions">
          <button type="button" className="wz-btn wz-btn-ghost" onClick={undo} disabled={!canUndo.past} aria-label="Annuler la dernière modification" title="Annuler (Ctrl+Z)">
            ↶ <span className="hidden lg:inline">Annuler</span>
          </button>
          <button type="button" className="wz-btn wz-btn-ghost" onClick={redo} disabled={!canUndo.future} aria-label="Rétablir" title="Rétablir (Ctrl+Y)">
            ↷ <span className="hidden lg:inline">Rétablir</span>
          </button>
          <button type="button" className="wz-btn wz-btn-ghost" disabled={step === 0} onClick={() => go(step - 1)} aria-label="Retour">
            ← <span className="hidden sm:inline">Retour</span>
          </button>
          {step < STEPS.length - 1 && (
            <button type="button" className={`wz-btn ${isNew ? "wz-btn-primary" : "wz-btn-soft"}`} onClick={() => go(step + 1)}>
              Continuer →
            </button>
          )}
          {(!isNew || step === STEPS.length - 1) && (
            <button type="button" disabled={pending || uploading} onClick={save} className="wz-btn wz-btn-primary">
              {pending ? "Enregistrement…" : isNew ? "Publier ma carte" : "Enregistrer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
