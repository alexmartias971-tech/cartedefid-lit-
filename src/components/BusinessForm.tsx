"use client";
/* eslint-disable @next/next/no-img-element */

import { useActionState, useMemo, useState } from "react";
import { saveBusiness, type FormState } from "@/app/admin/actions";
import { LINE_ICON_LABELS, LINE_ICONS } from "@/lib/visual";
import { computeCardState, formatEuro, MODE_LABELS, stripProgress, type CardDesign } from "@/lib/card-state";
import { THEMES } from "@/lib/themes";
import type { Business, CatalogReward, Program, RewardMode, Tier } from "@/lib/types";
import CardPreview from "./CardPreview";

type Props = { business?: Business; program?: Program; tiers?: Tier[]; catalog?: CatalogReward[] };

type TierRow = {
  key: string;
  id?: string;
  name: string;
  min_value: string;
  perk: string;
  color: string;
  /** Photo du niveau (adresse existante ou aperçu local du fichier choisi). */
  image?: string | null;
  removeImage?: boolean;
};
type RewardRow = { key: string; id?: string; name: string; cost: string };

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

const MODES: { value: RewardMode; title: string; text: string }[] = [
  { value: "stamps", title: "Tampons", text: "1 passage = 1 tampon. X tampons = 1 cadeau." },
  { value: "points", title: "Points", text: "Des points par euro dépensé, à échanger contre des cadeaux." },
  { value: "cashback", title: "Cashback", text: "Un % de chaque achat crédité en euros sur une cagnotte." },
];

const TIER_PRESETS: TierRow[] = [
  { key: "p1", name: "Bronze", min_value: "0", perk: "", color: "#8C5A2B" },
  { key: "p2", name: "Argent", min_value: "10", perk: "-5 % sur tout", color: "#6B7280" },
  { key: "p3", name: "Or", min_value: "25", perk: "-10 % sur tout", color: "#A07A1F" },
];

/**
 * Réduit une photo avant l'envoi (les photos de téléphone font 3 à 8 Mo ;
 * Vercel refuse les envois de plus de 4,5 Mo). Remplace le fichier dans le champ.
 */
async function shrinkInput(input: HTMLInputElement, maxWidth = 2000): Promise<File | null> {
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

/** Petit bloc d'envoi d'image avec aperçu et option "retirer". */
function ImageField(props: {
  id: string;
  label: string;
  hint: string;
  currentUrl: string | null;
  removeName?: string;
  onChange: (url: string | null) => void;
}) {
  const [removed, setRemoved] = useState(false);
  return (
    <div>
      <label htmlFor={props.id} className="label">
        {props.label}
      </label>
      <input
        id={props.id}
        name={props.id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="input"
        onChange={async (e) => {
          const f = await shrinkInput(e.target);
          if (f) {
            setRemoved(false);
            props.onChange(URL.createObjectURL(f));
          }
        }}
      />
      <p className="hint">{props.hint}</p>
      {props.removeName && props.currentUrl && (
        <label className="mt-1 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={props.removeName}
            checked={removed}
            onChange={(e) => {
              setRemoved(e.target.checked);
              props.onChange(e.target.checked ? null : props.currentUrl);
            }}
          />
          Retirer l&apos;image actuelle
        </label>
      )}
    </div>
  );
}

const PROGRESS_STYLES: { value: CardDesign["progressStyle"]; title: string; text: string }[] = [
  { value: "glass", title: "Verre dépoli", text: "Une bande en verre flouté avec les icônes (le plus premium)." },
  { value: "minimal", title: "Points fins", text: "Une rangée de petits points discrets en bas." },
  { value: "none", title: "Photo seule", text: "Aucun tampon dessiné : le compteur s'affiche en texte." },
];

/** Formulaire de création / modification d'une entreprise et de sa carte, avec aperçu en direct. */
export default function BusinessForm({ business, program, tiers = [], catalog = [] }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBusiness, {});

  const [v, setV] = useState({
    name: business?.name ?? "",
    program_name: program?.name ?? "Carte fidélité",
    mode: (program?.mode ?? "stamps") as RewardMode,
    reward_description: program?.reward_description ?? "",
    reward_threshold: program?.reward_threshold ?? 10,
    points_per_euro: String(program?.points_per_euro ?? 1),
    cashback_percent: String(program?.cashback_percent ?? 5),
    background_color: program?.background_color ?? "#0B6474",
    foreground_color: program?.foreground_color ?? "#FFFFFF",
    label_color: program?.label_color ?? "#CDE7EA",
    stamp_color: program?.stamp_color ?? "#FFFFFF",
    strip_overlay: program?.strip_overlay ?? 25,
    tiers_enabled: program?.tiers_enabled ?? false,
    tier_basis: (program?.tier_basis ?? "visits") as "visits" | "spend",
    decor_preset: program?.decor_preset ?? "none",
    photo_focus: (program?.photo_focus ?? "center") as CardDesign["photoFocus"],
    progress_style: (program?.progress_style ?? "glass") as CardDesign["progressStyle"],
    stamps_position: (program?.stamps_position ?? "bottom") as CardDesign["stampsPosition"],
    icon_preset: program?.icon_preset ?? "coffee",
    vessel: (program?.vessel ?? "glass") as CardDesign["vessel"],
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
  });
  const [collection, setCollection] = useState<string[]>(program?.collection_icons ?? ["iced", "coffee", "matcha", "icecream"]);
  const [sampleFilled, setSampleFilled] = useState(3);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: typeof v[k] === "number" ? Number(e.target.value) : e.target.value });

  const [logoUrl, setLogoUrl] = useState<string | null>(business?.logo_url ?? null);
  const [stripUrl, setStripUrl] = useState<string | null>(program?.strip_image_url ?? null);
  const [stampUrl] = useState<string | null>(program?.stamp_icon_url ?? null);
  const [stampEmptyUrl] = useState<string | null>(program?.stamp_empty_icon_url ?? null);

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

  // Aperçu : une carte d'exemple au milieu de son parcours
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
        image_url: t.image || null,
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
    };
    const metric = v.tier_basis === "spend" ? sample.lifetime_spent : sample.lifetime_visits;
    sample.tier_id = [...previewTiers].reverse().find((t) => t.min_value <= metric)?.id ?? null;
    const previewCatalog: CatalogReward[] = rewardRows
      .filter((r) => r.name && Number(r.cost) > 0)
      .map((r, i) => ({ id: r.key, program_id: "", name: r.name, cost: Number(r.cost), is_active: true, sort: i }));
    const cardState = computeCardState(
      {
        mode: v.mode,
        reward_threshold: v.reward_threshold,
        reward_description: v.reward_description || "ton cadeau",
        points_per_euro: Number(v.points_per_euro) || 1,
        cashback_percent: Number(v.cashback_percent) || 5,
        tiers_enabled: v.tiers_enabled,
        tier_basis: v.tier_basis,
      },
      sample,
      previewTiers,
      previewCatalog,
    );
    const nextReward = previewCatalog.sort((a, b) => a.cost - b.cost).find((r) => r.cost > sample.points_balance);
    const secondary =
      v.mode === "stamps"
        ? { label: "CADEAU", value: v.reward_description || "Ton cadeau" }
        : v.mode === "points"
          ? nextReward
            ? { label: `À ${nextReward.cost} PTS`, value: nextReward.name }
            : null
          : { label: "CASHBACK", value: `${Number(v.cashback_percent) || 0} %` };
    const progress = stripProgress(v.mode, cardState, sample, previewCatalog);
    const photo = cardState.tier?.image_url || null;
    return { cardState, secondary, progress, tierPhoto: photo };
  }, [v, tierRows, rewardRows, sampleFilled]);

  const design: CardDesign = {
    mode: v.mode,
    programName: v.program_name,
    backgroundColor: v.background_color,
    foregroundColor: v.foreground_color,
    labelColor: v.label_color,
    stampColor: v.stamp_color,
    stripOverlay: v.strip_overlay,
    stripImageUrl: stripUrl,
    stampIconUrl: stampUrl,
    stampEmptyIconUrl: stampEmptyUrl,
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
  };

  const tiersJson = JSON.stringify(
    tierRows.map((t) => ({ id: t.id, key: t.key, name: t.name, min_value: Number(t.min_value) || 0, perk: t.perk, color: t.color, remove_image: !!t.removeImage })),
  );
  const catalogJson = JSON.stringify(rewardRows.map((r) => ({ id: r.id, name: r.name, cost: Number(r.cost) })));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <input type="hidden" name="business_id" value={business?.id ?? ""} />
      <input type="hidden" name="tiers_json" value={tiersJson} />
      <input type="hidden" name="catalog_json" value={catalogJson} />
      {/* Options de design gérées par des boutons (envoyées au serveur ici) */}
      <input type="hidden" name="decor_preset" value={v.decor_preset} />
      <input type="hidden" name="progress_style" value={v.progress_style} />
      <input type="hidden" name="stamps_position" value={v.stamps_position} />
      <input type="hidden" name="icon_preset" value={v.icon_preset} />
      <input type="hidden" name="collection_icons" value={collection.join(",")} />
      <input type="hidden" name="vessel" value={v.vessel} />

      <div className="space-y-6 min-w-0">
        {/* ---------------- ENTREPRISE ---------------- */}
        <fieldset className="panel space-y-4">
          <legend className="text-lg font-bold px-1">1. L&apos;entreprise</legend>
          <div>
            <label htmlFor="name" className="label">Nom du commerce *</label>
            <input id="name" name="name" required className="input" value={v.name} onChange={set("name")} placeholder="Boulangerie du Bourg" />
          </div>
          <ImageField
            id="logo"
            label="Logo"
            hint="Idéal : carré, fond transparent (PNG). Sans logo, la première lettre du nom est utilisée."
            currentUrl={business?.logo_url ?? null}
            onChange={setLogoUrl}
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="label">Téléphone</label>
              <input id="phone" name="phone" className="input" defaultValue={business?.phone ?? ""} placeholder="0590 00 00 00" />
            </div>
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" name="email" type="email" className="input" defaultValue={business?.email ?? ""} />
            </div>
          </div>
          <div>
            <label htmlFor="address" className="label">Adresse</label>
            <input id="address" name="address" className="input" defaultValue={business?.address ?? ""} placeholder="12 rue Principale, 97190 Le Gosier" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="google_review_url" className="label">Lien « Laisser un avis Google »</label>
              <input id="google_review_url" name="google_review_url" type="url" className="input" defaultValue={business?.google_review_url ?? ""} placeholder="https://g.page/r/..." />
              <p className="hint">Affiché au dos de la carte. Jamais de récompense contre un avis (interdit par Google).</p>
            </div>
            <div>
              <label htmlFor="instagram_url" className="label">Lien Instagram</label>
              <input id="instagram_url" name="instagram_url" type="url" className="input" defaultValue={business?.instagram_url ?? ""} placeholder="https://instagram.com/..." />
            </div>
          </div>
          <div className="rounded-xl bg-[#eef6f7] p-3 space-y-3">
            <p className="text-sm font-semibold">📍 Carte sur l&apos;écran verrouillé quand le client passe devant</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="latitude" className="label">Latitude</label>
                <input id="latitude" name="latitude" inputMode="decimal" className="input" defaultValue={business?.latitude ?? ""} placeholder="16.2040" />
              </div>
              <div>
                <label htmlFor="longitude" className="label">Longitude</label>
                <input id="longitude" name="longitude" inputMode="decimal" className="input" defaultValue={business?.longitude ?? ""} placeholder="-61.4930" />
              </div>
            </div>
            <p className="hint">Sur Google Maps : clic droit sur le commerce → clique sur les chiffres pour les copier (ex : 16.2040, -61.4930). Le 1er nombre = latitude, le 2e = longitude.</p>
            <div>
              <label htmlFor="relevant_text" className="label">Message affiché quand le client est tout près</label>
              <input id="relevant_text" name="relevant_text" maxLength={80} className="input" defaultValue={business?.relevant_text ?? ""} placeholder="Un iced matcha face à la mer ? Ta carte est prête 🌴" />
            </div>
          </div>
        </fieldset>

        {/* ---------------- RÉCOMPENSES ---------------- */}
        <fieldset className="panel space-y-4">
          <legend className="text-lg font-bold px-1">2. Comment le client gagne</legend>
          <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Mode de récompense">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={`cursor-pointer rounded-xl border-2 p-3 ${v.mode === m.value ? "border-[var(--lagon)] bg-[#eef6f7]" : "border-gray-200"}`}
              >
                <input type="radio" name="mode" value={m.value} className="sr-only" checked={v.mode === m.value} onChange={set("mode")} />
                <span className="block font-bold">{m.title}</span>
                <span className="block text-sm text-gray-600">{m.text}</span>
              </label>
            ))}
          </div>

          {v.mode === "stamps" && (
            <div className="grid sm:grid-cols-[160px_1fr] gap-4">
              <div>
                <label htmlFor="reward_threshold" className="label">Tampons pour le cadeau *</label>
                <input id="reward_threshold" name="reward_threshold" type="number" min={2} max={50} required className="input" value={v.reward_threshold} onChange={set("reward_threshold")} />
              </div>
              <div>
                <label htmlFor="reward_description" className="label">Cadeau *</label>
                <input id="reward_description" name="reward_description" required className="input" value={v.reward_description} onChange={set("reward_description")} placeholder="1 pain au chocolat offert" />
              </div>
            </div>
          )}
          {v.mode !== "stamps" && (
            <>
              <input type="hidden" name="reward_threshold" value={v.reward_threshold} />
              <input type="hidden" name="reward_description" value={v.reward_description} />
            </>
          )}

          {v.mode === "points" && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="points_per_euro" className="label">Points gagnés par euro dépensé *</label>
                  <input id="points_per_euro" name="points_per_euro" type="number" step="0.1" min={0.1} max={100} className="input" value={v.points_per_euro} onChange={set("points_per_euro")} />
                  <p className="hint">Ex : 1 → un achat de 12 € donne 12 points.</p>
                </div>
              </div>
              <div>
                <span className="label">Catalogue de cadeaux *</span>
                <div className="space-y-2">
                  {rewardRows.map((r, i) => (
                    <div key={r.key} className="grid grid-cols-[110px_1fr_auto] gap-2 items-center">
                      <input aria-label="Points" type="number" min={1} className="input" value={r.cost}
                        onChange={(e) => setRewardRows(rewardRows.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
                      <input aria-label="Cadeau" className="input" value={r.name} placeholder="1 café offert"
                        onChange={(e) => setRewardRows(rewardRows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <button type="button" className="btn btn-danger text-sm py-2" onClick={() => setRewardRows(rewardRows.filter((_, j) => j !== i))}>
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-secondary text-sm mt-2" onClick={() => setRewardRows([...rewardRows, { key: newKey(), name: "", cost: "" }])}>
                  + Ajouter un cadeau
                </button>
              </div>
            </div>
          )}

          {v.mode === "cashback" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="cashback_percent" className="label">Cashback (%) *</label>
                <input id="cashback_percent" name="cashback_percent" type="number" step="0.5" min={0.5} max={50} className="input" value={v.cashback_percent} onChange={set("cashback_percent")} />
                <p className="hint">
                  Ex : 5 % → un achat de 40 € crédite {formatEuro(40 * (Number(v.cashback_percent) || 0) / 100)} sur la cagnotte.
                </p>
              </div>
            </div>
          )}
          {v.mode !== "points" && <input type="hidden" name="points_per_euro" value={v.points_per_euro} />}
          {v.mode !== "cashback" && <input type="hidden" name="cashback_percent" value={v.cashback_percent} />}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="max_stamps_per_day" className="label">Passages max par jour et par client</label>
              <input id="max_stamps_per_day" name="max_stamps_per_day" type="number" min={1} max={10} className="input" defaultValue={program?.max_stamps_per_day ?? 1} />
              <p className="hint">Anti-triche. 1 est conseillé.</p>
            </div>
            <div className={v.mode === "stamps" ? "hidden" : ""}>
              <label htmlFor="max_purchase_amount" className="label">Montant max d&apos;un achat (€)</label>
              <input id="max_purchase_amount" name="max_purchase_amount" type="number" min={1} className="input" defaultValue={program?.max_purchase_amount ?? 1000} />
              <p className="hint">Bloque les fautes de frappe (ex : 1200 au lieu de 12,00).</p>
            </div>
          </div>
        </fieldset>

        {/* ---------------- DESIGN ---------------- */}
        <fieldset className="panel space-y-5">
          <legend className="text-lg font-bold px-1">3. Le design de la carte</legend>
          <div>
            <label htmlFor="program_name" className="label">Nom de la carte *</label>
            <input id="program_name" name="program_name" required className="input" value={v.program_name} onChange={set("program_name")} />
          </div>

          <div className="rounded-xl bg-[#eef6f7] p-3 space-y-3">
            <p className="font-semibold">📸 La photo : c&apos;est elle qui donne envie</p>
            <ImageField
              id="strip_image"
              label="Photo principale de la carte"
              hint="Une vraie photo du commerce : la boisson star face à la mer, la vitrine de glaces… Au moins 1600 px de large, nette, lumineuse. Elle remplit toute la carte sur iPhone (iOS 27) et la bannière sur les autres téléphones."
              currentUrl={program?.strip_image_url ?? null}
              removeName="remove_strip_image"
              onChange={setStripUrl}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="photo_focus" className="label">Partie de la photo à garder</label>
                <select id="photo_focus" name="photo_focus" className="input" value={v.photo_focus} onChange={set("photo_focus")}>
                  <option value="top">Le haut</option>
                  <option value="center">Le centre</option>
                  <option value="bottom">Le bas</option>
                </select>
              </div>
              <div>
                <label htmlFor="strip_overlay" className="label">Assombrir la photo : {v.strip_overlay} %</label>
                <input id="strip_overlay" name="strip_overlay" type="range" min={0} max={60} step={5} className="w-full mt-3" value={v.strip_overlay} onChange={set("strip_overlay")} />
              </div>
            </div>
            <p className="hint">Sans photo, la carte utilise un dégradé de tes couleurs. Tu peux aussi mettre une photo différente par niveau (section 4).</p>
          </div>

          <div>
            <span className="label">Couleurs (prends-les dans la photo ou le logo)</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(
                [
                  ["background_color", "Fond de la carte"],
                  ["foreground_color", "Textes"],
                  ["label_color", "Petits titres"],
                  ["stamp_color", "Accent (cadeau)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={key} className="label text-sm">{label}</label>
                  <input id={key} name={key} type="color" className="h-11 w-full rounded-lg border border-gray-300 cursor-pointer" value={v[key]} onChange={set(key)} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <button key={t.id} type="button" title={t.label}
                  onClick={() => setV({ ...v, background_color: t.background_color, foreground_color: t.foreground_color, label_color: t.label_color, stamp_color: t.stamp_color })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs hover:border-gray-400">
                  <span className="h-4 w-4 rounded-full" style={{ background: t.background_color, boxShadow: `inset 0 0 0 3px ${t.stamp_color}` }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {v.mode !== "cashback" && (
            <div className="space-y-4 rounded-xl border border-gray-200 p-3">
              <div>
                <span className="label">Les tampons sur la photo</span>
                <div className="grid sm:grid-cols-3 gap-2">
                  {PROGRESS_STYLES.map((ps) => (
                    <label key={ps.value} className={`cursor-pointer rounded-xl border-2 p-2 ${v.progress_style === ps.value ? "border-[var(--lagon)] bg-[#eef6f7]" : "border-gray-200"}`}>
                      <input type="radio" className="sr-only" checked={v.progress_style === ps.value} onChange={() => setV({ ...v, progress_style: ps.value })} />
                      <span className="block font-semibold text-sm">{ps.title}</span>
                      <span className="block text-xs text-gray-600">{ps.text}</span>
                    </label>
                  ))}
                </div>
                {!PROGRESS_STYLES.some((ps) => ps.value === v.progress_style) && (
                  <p className="hint text-orange-700">Cette carte utilise un ancien style dessiné. Choisis un style ci-dessus pour passer au rendu photo.</p>
                )}
              </div>

              {v.progress_style === "glass" && (
                <div>
                  <span className="label">Icônes des tampons (dans l&apos;ordre, elles se répètent)</span>
                  <div className="grid grid-cols-6 sm:grid-cols-9 gap-2">
                    {Object.keys(LINE_ICON_LABELS).filter((id) => id !== "gift").map((id) => {
                      const pos = collection.indexOf(id);
                      return (
                        <button key={id} type="button" title={pos >= 0 ? `${pos + 1}. ${LINE_ICON_LABELS[id]}` : LINE_ICON_LABELS[id]} aria-pressed={pos >= 0}
                          onClick={() => setCollection(pos >= 0 ? collection.filter((x) => x !== id) : [...collection, id].slice(0, 8))}
                          className={`relative grid place-items-center rounded-full aspect-square border-2 ${pos >= 0 ? "border-[var(--lagon)]" : "border-gray-200"}`}
                          style={{ background: pos >= 0 ? v.background_color : "#fff" }}>
                          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke={pos >= 0 ? "#fff" : "#334155"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: LINE_ICONS[id] }} />
                          {pos >= 0 && <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--lagon)] text-[10px] font-bold text-white">{pos + 1}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="hint">Ex : thé glacé → café → matcha → glace : le client « collectionne » tout ce que tu vends. Choisis au moins une icône.</p>
                </div>
              )}

              {v.mode === "stamps" && v.progress_style !== "none" && (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="reward_on_last" checked={v.reward_on_last} onChange={(e) => setV({ ...v, reward_on_last: e.target.checked })} />
                  La dernière case montre le cadeau 🎁 (donne envie d&apos;aller au bout)
                </label>
              )}
            </div>
          )}
          {!(v.mode === "stamps" && v.progress_style !== "none") && v.reward_on_last && <input type="hidden" name="reward_on_last" value="on" />}
          <input type="hidden" name="fill_color" value={v.fill_color} />
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <span className="label">Textes de la carte (ton style à toi)</span>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="show_logo_text" checked={v.show_logo_text} onChange={(e) => setV({ ...v, show_logo_text: e.target.checked })} />
              Afficher le nom à côté du logo (décoche si ton logo contient déjà le nom)
            </label>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="label_balance" className="label">Titre du compteur</label>
                <input id="label_balance" name="label_balance" maxLength={16} className="input" value={v.label_balance} onChange={set("label_balance")} placeholder={v.mode === "stamps" ? "TAMPONS" : v.mode === "points" ? "POINTS" : "CAGNOTTE"} />
              </div>
              <div>
                <label htmlFor="label_customer" className="label">Titre du prénom</label>
                <input id="label_customer" name="label_customer" maxLength={16} className="input" value={v.label_customer} onChange={set("label_customer")} placeholder="CLIENT" />
              </div>
              <div>
                <label htmlFor="label_reward" className="label">Titre du cadeau</label>
                <input id="label_reward" name="label_reward" maxLength={16} className="input" value={v.label_reward} onChange={set("label_reward")} placeholder="CADEAU" />
              </div>
            </div>
            <p className="hint">Ex : « DOUCEURS », « MEMBRE », « TON 10e ». Laisse vide pour le texte par défaut.</p>
          </div>
          <div>
            <label htmlFor="back_text" className="label">Texte au dos de la carte</label>
            <textarea id="back_text" name="back_text" rows={3} className="input" defaultValue={program?.back_text ?? ""} placeholder="Horaires : lun-sam 6h-19h. Instagram : @boulangerie" />
          </div>
        </fieldset>

        {/* ---------------- NIVEAUX ---------------- */}
        <fieldset className="panel space-y-4">
          <legend className="text-lg font-bold px-1">4. Niveaux (rangs)</legend>
          <label className="inline-flex items-center gap-2 font-semibold">
            <input type="checkbox" name="tiers_enabled" checked={v.tiers_enabled}
              onChange={(e) => {
                setV({ ...v, tiers_enabled: e.target.checked });
                if (e.target.checked && tierRows.length === 0) setTierRows(TIER_PRESETS.map((t) => ({ ...t, key: newKey() })));
              }} />
            Activer les niveaux (Bronze, Argent, Or…)
          </label>
          {v.tiers_enabled && (
            <>
              <div>
                <label htmlFor="tier_basis" className="label">Le client monte de niveau selon</label>
                <select id="tier_basis" name="tier_basis" className="input" value={v.tier_basis} onChange={set("tier_basis")}>
                  <option value="visits">Son nombre de passages</option>
                  <option value="spend">Le total qu&apos;il a dépensé (€)</option>
                </select>
                {v.tier_basis === "spend" && v.mode === "stamps" && (
                  <p className="hint text-orange-700">En mode tampons, le commerçant ne saisit pas de montant : choisis plutôt « passages ».</p>
                )}
              </div>
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[1fr_110px_1.4fr_56px_auto] gap-2 text-xs font-semibold text-gray-500">
                  <span>Nom</span>
                  <span>{v.tier_basis === "spend" ? "À partir de (€)" : "À partir de (passages)"}</span>
                  <span>Avantage</span>
                  <span>Couleur</span>
                  <span />
                </div>
                {tierRows.map((t, i) => (
                  <div key={t.key} className="grid grid-cols-2 sm:grid-cols-[1fr_110px_1.4fr_56px_auto] gap-2 items-center">
                    <input aria-label="Nom du niveau" className="input" value={t.name} placeholder="Or"
                      onChange={(e) => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <input aria-label="Seuil" type="number" min={0} className="input" value={t.min_value}
                      onChange={(e) => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, min_value: e.target.value } : x)))} />
                    <input aria-label="Avantage" className="input col-span-2 sm:col-span-1" value={t.perk} placeholder="-10 % sur tout"
                      onChange={(e) => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, perk: e.target.value } : x)))} />
                    <input aria-label="Couleur de la carte à ce niveau" type="color" className="h-11 w-full rounded-lg border border-gray-300"
                      value={t.color || v.background_color}
                      onChange={(e) => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
                    <button type="button" className="btn btn-danger text-sm py-2" onClick={() => setTierRows(tierRows.filter((_, j) => j !== i))}>
                      Retirer
                    </button>
                    <div className="col-span-2 sm:col-span-5 flex flex-wrap items-center gap-3 pb-2 border-b border-gray-100">
                      {t.image && !t.removeImage && <img src={t.image} alt="" className="h-10 w-16 rounded object-cover" />}
                      <label className="text-sm">
                        <span className="text-gray-600">Photo de ce niveau (facultatif) : </span>
                        <input type="file" name={`tier_image_${t.key}`} accept="image/png,image/jpeg,image/webp" className="text-sm"
                          onChange={async (e) => {
                            const f = await shrinkInput(e.target);
                            if (f) setTierRows((rows) => rows.map((x) => (x.key === t.key ? { ...x, image: URL.createObjectURL(f), removeImage: false } : x)));
                          }} />
                      </label>
                      {t.id && t.image && (
                        <label className="text-xs inline-flex items-center gap-1">
                          <input type="checkbox" checked={!!t.removeImage} onChange={(e) => setTierRows(tierRows.map((x, j) => (j === i ? { ...x, removeImage: e.target.checked } : x)))} />
                          retirer
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary text-sm"
                onClick={() => setTierRows([...tierRows, { key: newKey(), name: "", min_value: "", perk: "", color: "" }])}>
                + Ajouter un niveau
              </button>
              <p className="hint">Quand le client atteint un niveau, sa carte prend la couleur et la photo de ce niveau : c&apos;est sa récompense visible. Le premier niveau commence en général à 0.</p>
            </>
          )}
          {!v.tiers_enabled && <input type="hidden" name="tier_basis" value={v.tier_basis} />}
        </fieldset>

        {/* ---------------- BOOSTERS ---------------- */}
        <fieldset className="panel space-y-4">
          <legend className="text-lg font-bold px-1">5. Boosters de fidélité</legend>
          {v.mode !== "cashback" && (
            <div>
              <label htmlFor="signup_bonus" className="label">
                {v.mode === "stamps" ? "Tampons offerts à l'inscription" : "Points offerts à l'inscription"}
              </label>
              <input id="signup_bonus" name="signup_bonus" type="number" min={0} max={v.mode === "stamps" ? Math.max(0, v.reward_threshold - 1) : 10000} className="input sm:max-w-[160px]" value={v.signup_bonus} onChange={set("signup_bonus")} />
              <p className="hint">
                Astuce prouvée : une carte qui commence avec 2 tampons sur 12 est plus souvent terminée qu&apos;une carte de 10 vide
                (le client a l&apos;impression d&apos;avoir déjà commencé).
              </p>
            </div>
          )}
          {v.mode === "cashback" && <input type="hidden" name="signup_bonus" value={0} />}
          <div className="rounded-xl bg-[#fff7ea] p-3 space-y-3">
            <p className="text-sm font-semibold">⏰ Heures creuses boostées</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="bonus_multiplier" className="label">Multiplicateur</label>
                <select id="bonus_multiplier" name="bonus_multiplier" className="input" value={v.bonus_multiplier} onChange={set("bonus_multiplier")}>
                  <option value={1}>Désactivé</option>
                  <option value={2}>× 2</option>
                  <option value={3}>× 3</option>
                </select>
              </div>
              <div>
                <label htmlFor="bonus_start_hour" className="label">De</label>
                <select id="bonus_start_hour" name="bonus_start_hour" className="input" value={v.bonus_start_hour} onChange={set("bonus_start_hour")} disabled={v.bonus_multiplier <= 1}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="bonus_end_hour" className="label">À</label>
                <select id="bonus_end_hour" name="bonus_end_hour" className="input" value={v.bonus_end_hour} onChange={set("bonus_end_hour")} disabled={v.bonus_multiplier <= 1}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h + 1} value={h + 1}>{h + 1} h</option>)}
                </select>
              </div>
            </div>
            <p className="hint">Ex : × 2 de 14 h à 17 h → le client gagne double pendant les heures calmes (heure de Guadeloupe).</p>
          </div>
          <div>
            <label htmlFor="referral_bonus" className="label">Parrainage : bonus pour le parrain</label>
            <input id="referral_bonus" name="referral_bonus" type="number" min={0} max={1000} className="input sm:max-w-[160px]" value={v.referral_bonus} onChange={set("referral_bonus")} />
            <p className="hint">
              {v.mode === "points" ? "Points" : v.mode === "cashback" ? "Euros ajoutés à la cagnotte" : "Tampons"} offerts au client qui fait venir un ami
              (à la 1re visite de l&apos;ami). 0 = désactivé.
            </p>
          </div>
        </fieldset>

        {/* ---------------- OFFRES ---------------- */}
        <fieldset className="panel space-y-4">
          <legend className="text-lg font-bold px-1">6. Offres automatiques</legend>
          <div>
            <label htmlFor="welcome_offer" className="label">Offre de bienvenue (à l&apos;inscription)</label>
            <input id="welcome_offer" name="welcome_offer" className="input" defaultValue={program?.welcome_offer ?? ""} placeholder="-10 % sur ton prochain achat" />
            <p className="hint">Laisse vide pour ne rien offrir. Le commerçant la valide une fois en caisse.</p>
          </div>
          <div>
            <label htmlFor="birthday_offer" className="label">Offre d&apos;anniversaire</label>
            <input id="birthday_offer" name="birthday_offer" className="input" defaultValue={program?.birthday_offer ?? ""} placeholder="1 dessert offert pour ton anniversaire 🎂" />
            <p className="hint">Ajoutée le jour de l&apos;anniversaire (si le client a donné sa date), valable 30 jours.</p>
          </div>
          <div>
            <label htmlFor="max_notifications_per_week" className="label">Notifications max par semaine</label>
            <input id="max_notifications_per_week" name="max_notifications_per_week" type="number" min={0} max={7} className="input sm:max-w-[160px]" defaultValue={business?.max_notifications_per_week ?? 2} />
            <p className="hint">2 est conseillé. 0 = notifications coupées.</p>
          </div>
        </fieldset>

        {state.error && <p className="alert-error">{state.error}</p>}
        {state.ok && <p className="alert-ok">{state.ok}</p>}
        <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">
          {pending ? "Enregistrement..." : business ? "Enregistrer les modifications" : "Créer l'entreprise et sa carte"}
        </button>
      </div>

      <div className="space-y-6 lg:sticky lg:top-6 self-start">
        <p className="text-sm text-gray-600">
          Exemple d&apos;un client en cours : {MODE_LABELS[v.mode].toLowerCase()}
          {v.tiers_enabled ? `, 12 passages / ${formatEuro(180)} dépensés` : ""}.
        </p>
        {v.mode === "stamps" && (
          <div>
            <label htmlFor="sample_filled" className="label text-sm">Voir la carte avec {Math.min(sampleFilled, v.reward_threshold)} tampon(s)</label>
            <input id="sample_filled" type="range" min={0} max={v.reward_threshold} value={Math.min(sampleFilled, v.reward_threshold)} onChange={(e) => setSampleFilled(Number(e.target.value))} className="w-full" />
          </div>
        )}
        {(["poster", "apple", "google"] as const).map((platform) => (
          <CardPreview
            key={platform}
            platform={platform}
            businessName={v.name}
            logoUrl={logoUrl}
            customerName="Marie"
            design={design}
            state={preview.cardState}
            photoUrl={preview.tierPhoto || stripUrl}
            progress={preview.progress}
            secondary={preview.secondary}
            couponsCount={0}
          />
        ))}
        <p className="text-xs text-gray-500">Le QR code de l&apos;aperçu est un vrai QR code (il contient un texte d&apos;exemple). Sur la vraie carte, il contient le numéro unique du client.</p>
      </div>
    </form>
  );
}
