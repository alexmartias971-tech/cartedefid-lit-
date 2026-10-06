"use client";
/* eslint-disable @next/next/no-img-element */

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { saveBusiness, type FormState } from "@/app/admin/actions";
import {
  computeCardState,
  currentWeekStart,
  formatEuro,
  layoutOf,
  resolveSlots,
  stripProgress,
  type CardDesign,
} from "@/lib/card-state";
import { defaultSlots, type CardLayout } from "@/lib/layout";
import type { Business, CatalogReward, Program, RewardMode, Tier } from "@/lib/types";
import DesignStep from "./DesignStep";
import { newKey, type TierRow, type Values } from "./shared";

type RewardRow = { key: string; id?: string; name: string; cost: string };

import { Field, More, Section, Segmented, Stepper, Toggle } from "./ui";

type Props = { business?: Business; program?: Program; tiers?: Tier[]; catalog?: CatalogReward[] };

const STEPS = [
  { title: "Le commerce", short: "Commerce", emoji: "🏪" },
  { title: "Comment on gagne", short: "Gains", emoji: "🎁" },
  { title: "Le design", short: "Design", emoji: "🎨" },
  { title: "Bonus et offres", short: "Bonus", emoji: "⚡" },
];

const MODES: { value: RewardMode; emoji: string; title: string; text: string }[] = [
  { value: "stamps", emoji: "🎟️", title: "Tampons", text: "1 passage = 1 tampon. Carte pleine = 1 cadeau." },
  { value: "points", emoji: "⭐", title: "Points", text: "Des points par euro, à échanger contre des cadeaux." },
  { value: "cashback", emoji: "💶", title: "Cashback", text: "Un % de chaque achat revient sur une cagnotte." },
];

const REWARD_IDEAS = ["1 café offert", "1 dessert offert", "-10 % sur l'addition", "1 boisson offerte", "1 séance offerte"];

const TIER_PRESETS: Omit<TierRow, "key">[] = [
  { name: "Bronze", min_value: "0", perk: "", color: "#8C5A2B" },
  { name: "Argent", min_value: "10", perk: "-5 % sur tout", color: "#6B7280" },
  { name: "Or", min_value: "25", perk: "-10 % sur tout", color: "#A07A1F" },
];

/** Réduit une photo trop lourde avant l'envoi (Vercel refuse plus de 4,5 Mo). */
export async function shrinkInput(input: HTMLInputElement, maxWidth = 2000): Promise<File | null> {
  const file = input.files?.[0];
  if (!file) return null;
  if (file.size < 900 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = file.type === "image/png";
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, png ? "image/png" : "image/jpeg", 0.86));
    if (!blob) return file;
    const out = new File([blob], file.name.replace(/\.\w+$/, png ? ".png" : ".jpg"), { type: blob.type });
    const dt = new DataTransfer();
    dt.items.add(out);
    input.files = dt.files;
    return out;
  } catch {
    return file;
  }
}

/** Étape à rouvrir selon le message d'erreur du serveur. */
function stepForError(msg: string): number {
  const m = msg.toLowerCase();
  if (m.includes("nom de la carte") || m.includes("entreprise") || m.includes("logo")) return 0;
  if (m.includes("photo de la carte") || m.includes("couleur") || m.includes("voile") || m.includes("disposition")) return 2;
  if (m.includes("niveau") || m.includes("heures") || m.includes("série")) return 3;
  if (/cadeau|tampons|points|cashback|catalogue|achat|passages|mode/.test(m)) return 1;
  return -1;
}

/** Éditeur de carte en 4 étapes, avec la carte modifiable directement à l'écran. */
export default function Studio({ business, program, tiers = [], catalog = [] }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBusiness, {});
  const [step, setStep] = useState(0);
  const [localError, setLocalError] = useState<{ msg: string; at: string } | null>(null);

  const [v, setValues] = useState<Values>({
    name: business?.name ?? "",
    program_name: program?.name ?? "Carte fidélité",
    mode: program?.mode ?? "stamps",
    reward_description: program?.reward_description ?? "",
    reward_threshold: program?.reward_threshold ?? 10,
    points_per_euro: Number(program?.points_per_euro ?? 1),
    cashback_percent: Number(program?.cashback_percent ?? 5),
    background_color: program?.background_color ?? "#0B6474",
    foreground_color: program?.foreground_color ?? "#FFFFFF",
    label_color: program?.label_color ?? "#CDE7EA",
    stamp_color: program?.stamp_color ?? "#FFFFFF",
    strip_overlay: program?.strip_overlay ?? 25,
    tiers_enabled: program?.tiers_enabled ?? false,
    tier_basis: program?.tier_basis ?? "visits",
    decor_preset: program?.decor_preset ?? "none",
    photo_focus: program?.photo_focus ?? "center",
    progress_style: program?.progress_style ?? "glass",
    stamps_position: program?.stamps_position ?? "bottom",
    icon_preset: program?.icon_preset ?? "coffee",
    vessel: program?.vessel ?? "glass",
    fill_color: program?.fill_color ?? "#8FD16A",
    reward_on_last: program?.reward_on_last ?? true,
    show_logo_text: program?.show_logo_text ?? true,
    label_balance: program?.label_balance ?? "",
    label_customer: program?.label_customer ?? "",
    label_reward: program?.label_reward ?? "",
    signup_bonus: program?.signup_bonus ?? 0,
    bonus_multiplier: program?.bonus_multiplier ?? 1,
    bonus_start_hour: program?.bonus_start_hour ?? 14,
    bonus_end_hour: program?.bonus_end_hour ?? 17,
    referral_bonus: program?.referral_bonus ?? 0,
    streak_enabled: program?.streak_enabled ?? false,
    streak_goal: program?.streak_goal ?? 4,
    streak_bonus: program?.streak_bonus ?? 1,
    streak_reminder_dow: program?.streak_reminder_dow ?? 0,
    streak_reminder_hour: program?.streak_reminder_hour ?? 11,
    lap_times_enabled: program?.lap_times_enabled ?? false,
  });
  const set = (patch: Partial<Values>) => setValues((prev) => ({ ...prev, ...patch }));

  const [collection, setCollection] = useState<string[]>(program?.collection_icons ?? ["iced", "coffee", "matcha", "icecream"]);
  const [layout, setLayout] = useState<CardLayout>(() => {
    const saved = program ? layoutOf(program) : { layers: [] };
    return {
      ...saved,
      slots: saved.slots ?? defaultSlots({ tiers: !!program?.tiers_enabled, streak: !!program?.streak_enabled, lap: !!program?.lap_times_enabled }),
    };
  });
  const [sampleFilled, setSampleFilled] = useState(3);
  const [previewTier, setPreviewTier] = useState("");

  // Images (les fichiers restent dans le formulaire, l'aperçu utilise une adresse locale)
  const logoInput = useRef<HTMLInputElement>(null);
  const stripInput = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(business?.logo_url ?? null);
  const [stripUrl, setStripUrl] = useState<string | null>(program?.strip_image_url ?? null);
  const [removeStrip, setRemoveStrip] = useState(false);

  const [tierRows, setTierRows] = useState<TierRow[]>(
    tiers.map((t) => ({
      key: newKey(),
      id: t.id,
      name: t.name,
      min_value: String(t.min_value),
      perk: t.perk ?? "",
      color: t.color ?? "",
      image: t.image_url ?? null,
      removeImage: false,
    })),
  );
  const [rewardRows, setRewardRows] = useState<RewardRow[]>(
    catalog.length > 0
      ? catalog.map((r) => ({ key: newKey(), id: r.id, name: r.name, cost: String(r.cost) }))
      : [{ key: newKey(), name: "", cost: "100" }],
  );

  // Modifications non enregistrées : on prévient avant de quitter la page
  const snapshot = JSON.stringify({ v, layout, collection, tierRows, rewardRows, logoUrl, stripUrl, removeStrip });
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const [seenState, setSeenState] = useState(state);
  const [errorAt, setErrorAt] = useState<string | null>(null);
  if (seenState !== state) {
    // Nouvel enregistrement réussi : l'état actuel devient la référence (et on rouvre l'étape d'une erreur)
    setSeenState(state);
    if (state.ok) setSavedSnapshot(snapshot);
    setErrorAt(state.error ? snapshot : null);
    if (state.error) {
      const s = stepForError(state.error);
      if (s >= 0) setStep(s);
    }
  }
  const dirty = snapshot !== savedSnapshot;
  // Le message « il manque… » disparaît dès qu'on corrige quelque chose
  const shownLocalError = localError && localError.at === snapshot ? localError.msg : null;
  const shownServerError = state.error && errorAt === snapshot ? state.error : null;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);


  // Carte d'exemple (Marie, au milieu de son parcours) pour l'aperçu
  const preview = useMemo(() => {
    const previewTiers: Tier[] = tierRows
      .filter((t) => t.name)
      .map((t, i) => ({
        id: t.key,
        program_id: "",
        name: t.name,
        min_value: Number(t.min_value) || 0,
        perk: t.perk || null,
        color: t.color || null,
        image_url: t.removeImage ? null : t.image || null,
        sort: i,
      }))
      .sort((a, b) => a.min_value - b.min_value);
    const sample = {
      stamps_count: Math.min(sampleFilled, v.reward_threshold),
      points_balance: 120,
      cashback_balance: 4.5,
      lifetime_visits: 12,
      lifetime_spent: 180,
      tier_id: null as string | null,
      streak_count: 3,
      streak_best: 5,
      streak_week: currentWeekStart(),
      best_lap_ms: 38412,
      lap_rank: 7,
      lap_rank_total: 48,
    };
    const metric = v.tier_basis === "spend" ? sample.lifetime_spent : sample.lifetime_visits;
    const forced = previewTiers.find((t) => t.id === previewTier);
    sample.tier_id = forced ? forced.id : ([...previewTiers].reverse().find((t) => t.min_value <= metric)?.id ?? null);
    const previewCatalog: CatalogReward[] = rewardRows
      .filter((r) => r.name && Number(r.cost) > 0)
      .map((r, i) => ({ id: r.key, program_id: "", name: r.name, cost: Number(r.cost), is_active: true, sort: i }))
      .sort((a, b) => a.cost - b.cost);
    const cardState = computeCardState(
      {
        mode: v.mode,
        reward_threshold: v.reward_threshold,
        reward_description: v.reward_description || "ton cadeau",
        points_per_euro: v.points_per_euro || 1,
        cashback_percent: v.cashback_percent || 5,
        tiers_enabled: v.tiers_enabled,
        tier_basis: v.tier_basis,
        streak_enabled: v.streak_enabled,
        streak_goal: v.streak_goal,
        lap_times_enabled: v.lap_times_enabled,
        progress_style: v.progress_style,
      },
      sample,
      previewTiers,
      previewCatalog,
    );
    const nextReward = previewCatalog.find((r) => r.cost > sample.points_balance) ?? null;
    const progress = stripProgress(v.mode, cardState, sample, previewCatalog);
    return { cardState, progress, nextReward, tierPhoto: cardState.tier?.image_url || null };
  }, [v, tierRows, rewardRows, sampleFilled, previewTier]);

  const design: CardDesign = {
    mode: v.mode,
    programName: v.program_name,
    backgroundColor: v.background_color,
    foregroundColor: v.foreground_color,
    labelColor: v.label_color,
    stampColor: v.stamp_color,
    stripOverlay: v.strip_overlay,
    stripImageUrl: stripUrl,
    stampIconUrl: program?.stamp_icon_url ?? null,
    stampEmptyIconUrl: program?.stamp_empty_icon_url ?? null,
    decorPreset: v.decor_preset,
    photoFocus: v.photo_focus,
    progressStyle: v.progress_style,
    stampsPosition: v.stamps_position,
    iconPreset: v.icon_preset,
    collectionIcons: collection,
    vessel: v.vessel,
    fillColor: v.fill_color,
    rewardOnLast: v.reward_on_last,
    showLogoText: v.show_logo_text,
    labelBalance: v.label_balance || null,
    labelCustomer: v.label_customer || null,
    labelReward: v.label_reward || null,
    layout,
  };
  const slots = resolveSlots(design, preview.cardState, {
    customerName: "Marie",
    mode: v.mode,
    rewardDescription: v.reward_description || "Ton cadeau",
    cashbackPercent: v.cashback_percent,
    nextReward: preview.nextReward ? { cost: preview.nextReward.cost, name: preview.nextReward.name } : null,
    coupons: 1,
  });

  const tiersJson = JSON.stringify(
    tierRows.map((t) => ({ id: t.id, key: t.key, name: t.name, min_value: Number(t.min_value) || 0, perk: t.perk, color: t.color, remove_image: !!t.removeImage })),
  );
  const catalogJson = JSON.stringify(rewardRows.map((r) => ({ id: r.id, name: r.name, cost: Number(r.cost) })));

  // Vérifications simples avant l'envoi (le serveur revérifie tout)
  function check(): string | null {
    if (!v.name.trim()) {
      setStep(0);
      return "Indique le nom du commerce.";
    }
    if (!v.program_name.trim()) {
      setStep(0);
      return "Indique le nom de la carte.";
    }
    if (v.mode === "stamps" && !v.reward_description.trim()) {
      setStep(1);
      return "Indique le cadeau gagné avec les tampons.";
    }
    if (v.mode === "points" && !rewardRows.some((r) => r.name.trim() && Number(r.cost) > 0)) {
      setStep(1);
      return "Ajoute au moins un cadeau au catalogue (ex : 100 points = 1 café).";
    }
    return null;
  }

  const hidden = (name: string, value: string | number | boolean) =>
    typeof value === "boolean" ? (value ? <input key={name} type="hidden" name={name} value="on" /> : null) : <input key={name} type="hidden" name={name} value={String(value)} />;
  const unit = v.mode === "stamps" ? (v.progress_style === "track" ? "secteur" : "tampon") : v.mode === "points" ? "point" : "€";

  return (
    <form
      action={action}
      noValidate
      className="studio"
      onSubmit={(e) => {
        const err = check();
        setLocalError(err ? { msg: err, at: snapshot } : null);
        if (err) e.preventDefault();
      }}
    >
      {/* Valeurs envoyées au serveur (les boutons de l'éditeur les modifient) */}
      <div hidden>
        <input type="hidden" name="business_id" value={business?.id ?? ""} />
        <input type="hidden" name="tiers_json" value={tiersJson} />
        <input type="hidden" name="catalog_json" value={catalogJson} />
        <input type="hidden" name="collection_icons" value={collection.join(",")} />
        <input type="hidden" name="card_layout" value={JSON.stringify(layout)} />
        {removeStrip && <input type="hidden" name="remove_strip_image" value="on" />}
        {(Object.keys(v) as (keyof Values)[]).map((k) => hidden(k, v[k]))}
        <input
          ref={logoInput}
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const f = await shrinkInput(e.target);
            if (f) setLogoUrl(URL.createObjectURL(f));
          }}
        />
        <input
          ref={stripInput}
          type="file"
          name="strip_image"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const f = await shrinkInput(e.target);
            if (f) {
              setStripUrl(URL.createObjectURL(f));
              setRemoveStrip(false);
            }
          }}
        />
      </div>

      {/* ---------- Étapes ---------- */}
      <nav className="st-steps" aria-label="Étapes">
        {STEPS.map((s, i) => (
          <button key={s.title} type="button" onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined} className={`st-step ${step === i ? "st-step-on" : i < step ? "st-step-done" : ""}`}>
            <span className="st-step-num">{i < step ? "✓" : i + 1}</span>
            <span className="st-step-label">
              <span className="hidden sm:inline">{s.title}</span>
              <span className="sm:hidden">{s.short}</span>
            </span>
          </button>
        ))}
      </nav>

      {/* ---------- 1. Le commerce ---------- */}
      <div hidden={step !== 0} className="st-page">
        <header className="st-page-head">
          <span className="st-kicker">Étape 1 sur 4</span>
          <h2 className="st-h2">🏪 Le commerce</h2>
          <p className="st-lead">Le nom, le logo et les infos qui s&apos;affichent sur la carte.</p>
        </header>
        <Section title="Identité">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-4">
              <Field label="Nom du commerce" htmlFor="st-name">
                <input id="st-name" className="st-input st-input-lg" value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex : Coffee Plage" maxLength={60} />
              </Field>
              <Field label="Nom de la carte" htmlFor="st-program" hint="Ex : Carte fidélité, Club VIP, Le Pass…">
                <input id="st-program" className="st-input" value={v.program_name} onChange={(e) => set({ program_name: e.target.value })} maxLength={40} />
              </Field>
            </div>
            <div className="space-y-2">
              <span className="st-label">Logo</span>
              <button type="button" className="st-drop" onClick={() => logoInput.current?.click()}>
                {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-24 max-w-full object-contain" /> : <span className="text-3xl">＋</span>}
                <span className="st-hint">{logoUrl ? "Changer le logo" : "Choisir un logo (PNG, fond transparent)"}</span>
              </button>
            </div>
          </div>
        </Section>
        <Section title="Coordonnées" hint="Elles apparaissent au dos de la carte.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Téléphone" htmlFor="phone">
              <input id="phone" name="phone" className="st-input" defaultValue={business?.phone ?? ""} placeholder="0590 00 00 00" />
            </Field>
            <Field label="E-mail" htmlFor="email">
              <input id="email" name="email" type="email" className="st-input" defaultValue={business?.email ?? ""} />
            </Field>
          </div>
          <Field label="Adresse" htmlFor="address">
            <input id="address" name="address" className="st-input" defaultValue={business?.address ?? ""} placeholder="12 rue Principale, 97190 Le Gosier" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lien « Laisser un avis Google »" htmlFor="google_review_url" hint="Jamais de récompense contre un avis (interdit par Google).">
              <input id="google_review_url" name="google_review_url" type="url" className="st-input" defaultValue={business?.google_review_url ?? ""} placeholder="https://g.page/r/..." />
            </Field>
            <Field label="Lien Instagram" htmlFor="instagram_url">
              <input id="instagram_url" name="instagram_url" type="url" className="st-input" defaultValue={business?.instagram_url ?? ""} placeholder="https://instagram.com/..." />
            </Field>
          </div>
          <More title="📍 Option : la carte s'affiche quand le client passe devant">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Latitude" htmlFor="latitude">
                <input id="latitude" name="latitude" inputMode="decimal" className="st-input" defaultValue={business?.latitude ?? ""} placeholder="16.2040" />
              </Field>
              <Field label="Longitude" htmlFor="longitude">
                <input id="longitude" name="longitude" inputMode="decimal" className="st-input" defaultValue={business?.longitude ?? ""} placeholder="-61.4930" />
              </Field>
            </div>
            <p className="st-hint">Sur Google Maps : clic droit sur le commerce, puis clique sur les chiffres pour les copier. Le 1er = latitude, le 2e = longitude.</p>
            <Field label="Message affiché à proximité" htmlFor="relevant_text">
              <input id="relevant_text" name="relevant_text" maxLength={80} className="st-input" defaultValue={business?.relevant_text ?? ""} placeholder="Un iced matcha face à la mer ? Ta carte est prête 🌴" />
            </Field>
          </More>
        </Section>
      </div>

      {/* ---------- 2. Comment on gagne ---------- */}
      <div hidden={step !== 1} className="st-page">
        <header className="st-page-head">
          <span className="st-kicker">Étape 2 sur 4</span>
          <h2 className="st-h2">🎁 Comment le client gagne</h2>
          <p className="st-lead">Choisis une façon de récompenser. Tu pourras la changer plus tard.</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Façon de gagner">
          {MODES.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={v.mode === m.value} onClick={() => set({ mode: m.value })} className={`st-mode ${v.mode === m.value ? "st-mode-on" : ""}`}>
              <span className="block h-10 text-3xl leading-10" aria-hidden="true">{m.emoji}</span>
              <span className="block text-lg font-bold">{m.title}</span>
              <span className="st-hint block">{m.text}</span>
            </button>
          ))}
        </div>

        {v.mode === "stamps" && (
          <Section title={v.progress_style === "track" ? "Le tour du circuit" : "La carte à tampons"}>
            <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
              <Field label={v.progress_style === "track" ? "Secteurs pour boucler le tour" : "Passages pour avoir le cadeau"}>
                <Stepper value={v.reward_threshold} onChange={(n) => set({ reward_threshold: n })} min={2} max={50} label="Nombre de passages" />
              </Field>
              <Field label="Le cadeau" htmlFor="st-reward">
                <input id="st-reward" className="st-input st-input-lg" value={v.reward_description} onChange={(e) => set({ reward_description: e.target.value })} placeholder="Ex : 1 café offert" maxLength={60} />
                <div className="flex flex-wrap gap-2 pt-1">
                  {REWARD_IDEAS.map((idea) => (
                    <button key={idea} type="button" className="st-chip" onClick={() => set({ reward_description: idea })}>{idea}</button>
                  ))}
                </div>
              </Field>
            </div>
            <p className="st-summary">
              👉 Après <b>{v.reward_threshold}</b> passages, le client gagne : <b>{v.reward_description || "…"}</b>. Puis sa carte repart à zéro.
            </p>
          </Section>
        )}

        {v.mode === "points" && (
          <Section title="Les points">
            <Field label="Points gagnés par euro dépensé" hint="Ex : 1 → un achat de 12 € donne 12 points.">
              <Stepper value={v.points_per_euro} onChange={(n) => set({ points_per_euro: n })} min={0.1} max={100} step={0.1} label="Points par euro" />
            </Field>
            <div className="space-y-2">
              <span className="st-label">Les cadeaux à échanger</span>
              {rewardRows.map((r, i) => (
                <div key={r.key} className="grid grid-cols-[120px_1fr_auto] items-center gap-2">
                  <div className="relative">
                    <input aria-label="Points" type="number" min={1} className="st-input pr-10" value={r.cost} onChange={(e) => setRewardRows(rewardRows.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
                    <span className="st-hint absolute right-3 top-1/2 -translate-y-1/2">pts</span>
                  </div>
                  <input aria-label="Cadeau" className="st-input" value={r.name} placeholder="1 café offert" onChange={(e) => setRewardRows(rewardRows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <button type="button" className="st-icon-btn" aria-label="Retirer ce cadeau" onClick={() => setRewardRows(rewardRows.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button type="button" className="st-btn st-btn-ghost" onClick={() => setRewardRows([...rewardRows, { key: newKey(), name: "", cost: "" }])}>+ Ajouter un cadeau</button>
            </div>
          </Section>
        )}

        {v.mode === "cashback" && (
          <Section title="Le cashback">
            <Field label="Part de chaque achat qui revient au client" hint={`Ex : un achat de 40 € crédite ${formatEuro((40 * (v.cashback_percent || 0)) / 100)} sur sa cagnotte.`}>
              <Stepper value={v.cashback_percent} onChange={(n) => set({ cashback_percent: n })} min={0.5} max={50} step={0.5} suffix="%" label="Cashback en pourcentage" />
            </Field>
          </Section>
        )}

        <More title="🛡️ Réglages anti-triche">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Passages max par jour et par client" htmlFor="max_stamps_per_day" hint="1 est conseillé.">
              <input id="max_stamps_per_day" name="max_stamps_per_day" type="number" min={1} max={10} className="st-input" defaultValue={program?.max_stamps_per_day ?? 1} />
            </Field>
            <div className={v.mode === "stamps" ? "hidden" : ""}>
              <Field label="Montant max d'un achat (€)" htmlFor="max_purchase_amount" hint="Bloque les fautes de frappe (1200 au lieu de 12,00).">
                <input id="max_purchase_amount" name="max_purchase_amount" type="number" min={1} className="st-input" defaultValue={program?.max_purchase_amount ?? 1000} />
              </Field>
            </div>
          </div>
        </More>
      </div>

      {/* ---------- 3. Le design ---------- */}
      <div hidden={step !== 2} className="st-page">
        <header className="st-page-head">
          <span className="st-kicker">Étape 3 sur 4</span>
          <h2 className="st-h2">🎨 Le design</h2>
          <p className="st-lead">Clique sur la carte pour modifier. Les pointillés montrent tout ce que tu peux changer.</p>
        </header>
        <DesignStep
          v={v}
          set={set}
          design={design}
          layout={layout}
          setLayout={setLayout}
          collection={collection}
          setCollection={setCollection}
          logoUrl={logoUrl}
          stripUrl={stripUrl}
          onPickLogo={() => logoInput.current?.click()}
          onPickPhoto={() => stripInput.current?.click()}
          onRemovePhoto={() => {
            if (stripInput.current) stripInput.current.value = "";
            setStripUrl(null);
            setRemoveStrip(!!program?.strip_image_url);
          }}
          cardState={preview.cardState}
          progress={preview.progress}
          slots={slots}
          photo={preview.tierPhoto || stripUrl}
          sampleFilled={sampleFilled}
          setSampleFilled={setSampleFilled}
          tierRows={tierRows}
          previewTier={previewTier}
          setPreviewTier={setPreviewTier}
          goToStep={setStep}
        />
      </div>

      {/* ---------- 4. Bonus et offres ---------- */}
      <div hidden={step !== 3} className="st-page">
        <header className="st-page-head">
          <span className="st-kicker">Étape 4 sur 4</span>
          <h2 className="st-h2">⚡ Bonus et offres</h2>
          <p className="st-lead">Tout est facultatif. Active seulement ce qui plaît au commerçant.</p>
        </header>

        <Section title="Niveaux (Bronze, Argent, Or…)" hint="Quand le client monte de niveau, sa carte change de couleur et de photo.">
          <Toggle
            checked={v.tiers_enabled}
            onChange={(on) => {
              set({ tiers_enabled: on });
              if (on && tierRows.length === 0) setTierRows(TIER_PRESETS.map((t) => ({ ...t, key: newKey() })));
            }}
            label="Activer les niveaux"
          />
          {v.tiers_enabled && (
            <div className="space-y-3">
              <Field label="Le client monte de niveau selon">
                <Segmented value={v.tier_basis} onChange={(b) => set({ tier_basis: b })} label="Base des niveaux" options={[{ value: "visits", label: "Ses passages" }, { value: "spend", label: "Ses achats (€)" }]} />
              </Field>
              {v.tier_basis === "spend" && v.mode === "stamps" && <p className="st-warn">En mode tampons, le commerçant ne saisit pas de montant : choisis plutôt « passages ».</p>}
              {tierRows.map((t, i) => (
                <div key={t.key} className="st-row">
                  <div className="grid gap-2 sm:grid-cols-[1fr_130px_1.3fr_auto_auto] sm:items-center">
                    <input aria-label="Nom du niveau" className="st-input" value={t.name} placeholder="Or" onChange={(e) => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <div className="relative">
                      <input aria-label="À partir de" type="number" min={0} className="st-input pr-14" value={t.min_value} onChange={(e) => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, min_value: e.target.value } : x)))} />
                      <span className="st-hint absolute right-3 top-1/2 -translate-y-1/2">{v.tier_basis === "spend" ? "€" : "pass."}</span>
                    </div>
                    <input aria-label="Avantage" className="st-input" value={t.perk} placeholder="Avantage : -10 % sur tout" onChange={(e) => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, perk: e.target.value } : x)))} />
                    <label className="st-swatch st-swatch-free" title="Couleur de la carte à ce niveau">
                      <input type="color" value={t.color || v.background_color} onChange={(e) => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} aria-label={`Couleur du niveau ${t.name}`} />
                      <span style={{ background: t.color || v.background_color }} />
                    </label>
                    <button type="button" className="st-icon-btn" aria-label="Retirer ce niveau" onClick={() => setTierRows(tierRows.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {t.image && !t.removeImage && <img src={t.image} alt="" className="h-10 w-16 rounded-md object-cover" />}
                    <label className="st-btn st-btn-ghost cursor-pointer text-sm">
                      📷 {t.image && !t.removeImage ? "Changer la photo de ce niveau" : "Photo de ce niveau (facultatif)"}
                      <input
                        type="file"
                        name={`tier_image_${t.key}`}
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={async (e) => {
                          const f = await shrinkInput(e.target);
                          if (f) setTierRows((rows) => rows.map((x) => (x.key === t.key ? { ...x, image: URL.createObjectURL(f), removeImage: false } : x)));
                        }}
                      />
                    </label>
                    {t.id && t.image && !t.removeImage && (
                      <button type="button" className="st-link" onClick={() => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, removeImage: true } : x)))}>Retirer la photo</button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" className="st-btn st-btn-ghost" onClick={() => setTierRows([...tierRows, { key: newKey(), name: "", min_value: "", perk: "", color: "" }])}>+ Ajouter un niveau</button>
            </div>
          )}
        </Section>

        <Section title="Boosters de fidélité">
          {v.mode !== "cashback" && (
            <Field label={`${unit === "point" ? "Points" : "Tampons"} offerts à l'inscription`} hint="Une carte qui démarre avec 2 tampons est plus souvent terminée qu'une carte vide.">
              <Stepper value={v.signup_bonus} onChange={(n) => set({ signup_bonus: n })} min={0} max={v.mode === "stamps" ? Math.max(0, v.reward_threshold - 1) : 10000} label="Bonus d'inscription" />
            </Field>
          )}
          <div className="st-row space-y-3">
            <Toggle checked={v.bonus_multiplier > 1} onChange={(on) => set({ bonus_multiplier: on ? 2 : 1 })} label="⏰ Heures creuses boostées" hint="Le client gagne double (ou triple) pendant les heures calmes." />
            {v.bonus_multiplier > 1 && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Gain">
                  <Segmented value={v.bonus_multiplier} onChange={(n) => set({ bonus_multiplier: n })} label="Multiplicateur" options={[{ value: 2, label: "× 2" }, { value: 3, label: "× 3" }]} />
                </Field>
                <Field label="De" htmlFor="st-bstart">
                  <select id="st-bstart" className="st-input" value={v.bonus_start_hour} onChange={(e) => set({ bonus_start_hour: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}
                  </select>
                </Field>
                <Field label="À" htmlFor="st-bend">
                  <select id="st-bend" className="st-input" value={v.bonus_end_hour} onChange={(e) => set({ bonus_end_hour: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h + 1} value={h + 1}>{h + 1} h</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>
          <div className="st-row space-y-3">
            <Toggle checked={v.streak_enabled} onChange={(on) => set({ streak_enabled: on })} label="🔥 Série de la semaine" hint="Récompense ceux qui reviennent chaque semaine." />
            {v.streak_enabled && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Semaines d'affilée">
                  <Stepper value={v.streak_goal} onChange={(n) => set({ streak_goal: n })} min={2} max={52} label="Semaines d'affilée" />
                </Field>
                <Field label={`Bonus (${unit}s)`}>
                  <Stepper value={v.streak_bonus} onChange={(n) => set({ streak_bonus: n })} min={0} max={1000} label="Bonus de série" />
                </Field>
                <Field label="Rappel le" htmlFor="st-sdow">
                  <select id="st-sdow" className="st-input" value={v.streak_reminder_dow} onChange={(e) => set({ streak_reminder_dow: Number(e.target.value) })}>
                    {["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"].map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </Field>
                <Field label="à" htmlFor="st-shour">
                  <select id="st-shour" className="st-input" value={v.streak_reminder_hour} onChange={(e) => set({ streak_reminder_hour: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>
          <div className="st-row">
            <Toggle checked={v.lap_times_enabled} onChange={(on) => set({ lap_times_enabled: on })} label="⏱️ Record et classement" hint="Karting, sport… Le commerçant saisit le meilleur temps ; la carte affiche le record et la position (P1, P2…)." />
          </div>
          <Field label="Parrainage : bonus pour le parrain" hint={`${v.mode === "points" ? "Points" : v.mode === "cashback" ? "Euros" : "Tampons"} offerts quand un ami vient pour la 1re fois. 0 = désactivé.`}>
            <Stepper value={v.referral_bonus} onChange={(n) => set({ referral_bonus: n })} min={0} max={1000} label="Bonus de parrainage" />
          </Field>
        </Section>

        <Section title="Offres automatiques">
          <Field label="Offre de bienvenue (à l'inscription)" htmlFor="welcome_offer" hint="Laisse vide pour ne rien offrir.">
            <input id="welcome_offer" name="welcome_offer" className="st-input" defaultValue={program?.welcome_offer ?? ""} placeholder="-10 % sur ton prochain achat" />
          </Field>
          <Field label="Offre d'anniversaire" htmlFor="birthday_offer" hint="Ajoutée le jour J si le client a donné sa date, valable 30 jours.">
            <input id="birthday_offer" name="birthday_offer" className="st-input" defaultValue={program?.birthday_offer ?? ""} placeholder="1 dessert offert pour ton anniversaire 🎂" />
          </Field>
          <Field label="Notifications max par semaine" htmlFor="max_notifications_per_week" hint="2 est conseillé. 0 = notifications coupées.">
            <input id="max_notifications_per_week" name="max_notifications_per_week" type="number" min={0} max={7} className="st-input sm:max-w-[160px]" defaultValue={business?.max_notifications_per_week ?? 2} />
          </Field>
        </Section>

        <Section title="Le dos de la carte" hint="Horaires, réseaux, infos pratiques.">
          <textarea name="back_text" rows={3} className="st-input" defaultValue={program?.back_text ?? ""} placeholder="Horaires : lun-sam 6h-19h. Instagram : @moncommerce" aria-label="Texte au dos de la carte" />
        </Section>
      </div>

      {/* ---------- Barre du bas ---------- */}
      <div className="st-bar">
        <div className="st-bar-msg" aria-live="polite">
          {shownLocalError || shownServerError ? (
            <span className="st-bar-error">⚠️ {shownLocalError || shownServerError}</span>
          ) : state.ok && !dirty ? (
            <span className="st-bar-ok">✓ {state.ok}</span>
          ) : dirty ? (
            <span className="st-hint">Modifications non enregistrées</span>
          ) : null}
        </div>
        <div className="st-bar-actions">
          <button type="button" className="st-btn st-btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)} aria-label="Étape précédente">←<span className="hidden sm:inline"> Retour</span></button>
          {step < STEPS.length - 1 && (
            <button type="button" className="st-btn st-btn-soft" onClick={() => setStep(step + 1)}>Suivant →</button>
          )}
          <button type="submit" disabled={pending} className="st-btn st-btn-primary">
            {pending ? "Enregistrement…" : business ? "Enregistrer" : "Créer la carte"}
          </button>
        </div>
      </div>
    </form>
  );
}
