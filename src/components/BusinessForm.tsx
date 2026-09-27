"use client";

import { useActionState, useMemo, useState } from "react";
import { saveBusiness, type FormState } from "@/app/admin/actions";
import { computeCardState, formatEuro, MODE_LABELS } from "@/lib/card-state";
import type { Business, CatalogReward, Program, RewardMode, Tier } from "@/lib/types";
import CardPreview from "./CardPreview";

type Props = { business?: Business; program?: Program; tiers?: Tier[]; catalog?: CatalogReward[] };

type TierRow = { key: string; id?: string; name: string; min_value: string; perk: string; color: string };
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
        onChange={(e) => {
          const f = e.target.files?.[0];
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
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: e.target.type === "number" || e.target.type === "range" ? Number(e.target.value) : e.target.value });

  const [logoUrl, setLogoUrl] = useState<string | null>(business?.logo_url ?? null);
  const [stripUrl, setStripUrl] = useState<string | null>(program?.strip_image_url ?? null);
  const [stampUrl, setStampUrl] = useState<string | null>(program?.stamp_icon_url ?? null);
  const [stampEmptyUrl, setStampEmptyUrl] = useState<string | null>(program?.stamp_empty_icon_url ?? null);

  const [tierRows, setTierRows] = useState<TierRow[]>(
    tiers.map((t) => ({
      key: newKey(),
      id: t.id,
      name: t.name,
      min_value: String(t.min_value),
      perk: t.perk ?? "",
      color: t.color ?? "",
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
        sort: i,
      }))
      .sort((a, b) => a.min_value - b.min_value);
    const sample = {
      stamps_count: Math.min(3, v.reward_threshold),
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
    return { cardState, secondary };
  }, [v, tierRows, rewardRows]);

  const design = {
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
  };

  const tiersJson = JSON.stringify(
    tierRows.map((t) => ({ id: t.id, name: t.name, min_value: Number(t.min_value) || 0, perk: t.perk, color: t.color })),
  );
  const catalogJson = JSON.stringify(rewardRows.map((r) => ({ id: r.id, name: r.name, cost: Number(r.cost) })));

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <input type="hidden" name="business_id" value={business?.id ?? ""} />
      <input type="hidden" name="tiers_json" value={tiersJson} />
      <input type="hidden" name="catalog_json" value={catalogJson} />

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
        <fieldset className="panel space-y-4">
          <legend className="text-lg font-bold px-1">3. Le design de la carte</legend>
          <div>
            <label htmlFor="program_name" className="label">Nom de la carte *</label>
            <input id="program_name" name="program_name" required className="input" value={v.program_name} onChange={set("program_name")} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(
              [
                ["background_color", "Fond"],
                ["foreground_color", "Textes"],
                ["label_color", "Titres"],
                ["stamp_color", "Tampons"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={key} className="label">{label}</label>
                <input id={key} name={key} type="color" className="h-11 w-full rounded-lg border border-gray-300 cursor-pointer" value={v[key]} onChange={set(key)} />
              </div>
            ))}
          </div>
          <ImageField
            id="strip_image"
            label="Image de décor (bannière au milieu de la carte)"
            hint="Format paysage, idéalement 1125 × 369 pixels (ou plus grand, elle sera recadrée). Ex : photo de la vitrine, motif, texture."
            currentUrl={program?.strip_image_url ?? null}
            removeName="remove_strip_image"
            onChange={setStripUrl}
          />
          <div>
            <label htmlFor="strip_overlay" className="label">Voile sombre sur le décor : {v.strip_overlay} %</label>
            <input id="strip_overlay" name="strip_overlay" type="range" min={0} max={80} step={5} className="w-full" value={v.strip_overlay} onChange={set("strip_overlay")} />
            <p className="hint">Assombrit l&apos;image pour que les tampons et le texte restent lisibles.</p>
          </div>
          {v.mode === "stamps" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <ImageField
                id="stamp_icon"
                label="Icône du tampon (rempli)"
                hint="PNG carré sur fond transparent : café, croissant, étoile, ton logo… Sans icône : rond coché de la couleur « Tampons »."
                currentUrl={program?.stamp_icon_url ?? null}
                removeName="remove_stamp_icon"
                onChange={setStampUrl}
              />
              <ImageField
                id="stamp_empty_icon"
                label="Icône du tampon vide (facultatif)"
                hint="Sans icône vide, l'icône pleine est affichée en transparence."
                currentUrl={program?.stamp_empty_icon_url ?? null}
                removeName="remove_stamp_empty_icon"
                onChange={setStampEmptyUrl}
              />
            </div>
          )}
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
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary text-sm"
                onClick={() => setTierRows([...tierRows, { key: newKey(), name: "", min_value: "", perk: "", color: "" }])}>
                + Ajouter un niveau
              </button>
              <p className="hint">La couleur change le fond de la carte quand le client atteint ce niveau. Le premier niveau commence en général à 0.</p>
            </>
          )}
          {!v.tiers_enabled && <input type="hidden" name="tier_basis" value={v.tier_basis} />}
        </fieldset>

        {/* ---------------- OFFRES ---------------- */}
        <fieldset className="panel space-y-4">
          <legend className="text-lg font-bold px-1">5. Offres automatiques</legend>
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
        {(["apple", "google"] as const).map((platform) => (
          <CardPreview
            key={platform}
            platform={platform}
            businessName={v.name}
            logoUrl={logoUrl}
            customerName="Marie"
            design={design}
            state={preview.cardState}
            secondary={preview.secondary}
            couponsCount={0}
          />
        ))}
      </div>
    </form>
  );
}
