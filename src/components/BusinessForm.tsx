"use client";

import { useActionState, useState } from "react";
import { saveBusiness, type FormState } from "@/app/admin/actions";
import type { Business, Program } from "@/lib/types";
import CardPreview from "./CardPreview";

type Props = { business?: Business; program?: Program };

/** Formulaire de création / modification d'une entreprise et de sa carte, avec aperçu en direct. */
export default function BusinessForm({ business, program }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBusiness, {});
  const [v, setV] = useState({
    name: business?.name ?? "",
    program_name: program?.name ?? "Carte fidélité",
    reward_description: program?.reward_description ?? "",
    reward_threshold: program?.reward_threshold ?? 10,
    background_color: program?.background_color ?? "#0B6474",
    foreground_color: program?.foreground_color ?? "#FFFFFF",
    label_color: program?.label_color ?? "#CDE7EA",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(business?.logo_url ?? null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: k === "reward_threshold" ? Number(e.target.value) : e.target.value });

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <input type="hidden" name="business_id" value={business?.id ?? ""} />

      <div className="space-y-6">
        <fieldset className="panel space-y-4">
          <legend className="text-lg font-bold px-1">L&apos;entreprise</legend>
          <div>
            <label htmlFor="name" className="label">
              Nom du commerce *
            </label>
            <input
              id="name"
              name="name"
              required
              className="input"
              value={v.name}
              onChange={set("name")}
              placeholder="Boulangerie du Bourg"
            />
          </div>
          <div>
            <label htmlFor="logo" className="label">
              Logo (PNG, JPG ou WEBP, 3 Mo max)
            </label>
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setLogoPreview(URL.createObjectURL(f));
              }}
            />
            <p className="hint">
              Idéal : logo carré sur fond transparent. Sans logo, la première lettre du nom est utilisée.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="label">
                Téléphone
              </label>
              <input
                id="phone"
                name="phone"
                className="input"
                defaultValue={business?.phone ?? ""}
                placeholder="0590 00 00 00"
              />
            </div>
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input id="email" name="email" type="email" className="input" defaultValue={business?.email ?? ""} />
            </div>
          </div>
          <div>
            <label htmlFor="address" className="label">
              Adresse
            </label>
            <input
              id="address"
              name="address"
              className="input"
              defaultValue={business?.address ?? ""}
              placeholder="12 rue Principale, 97190 Le Gosier"
            />
          </div>
        </fieldset>

        <fieldset className="panel space-y-4">
          <legend className="text-lg font-bold px-1">La carte</legend>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="program_name" className="label">
                Nom de la carte *
              </label>
              <input
                id="program_name"
                name="program_name"
                required
                className="input"
                value={v.program_name}
                onChange={set("program_name")}
              />
            </div>
            <div>
              <label htmlFor="reward_threshold" className="label">
                Tampons pour le cadeau *
              </label>
              <input
                id="reward_threshold"
                name="reward_threshold"
                type="number"
                min={2}
                max={50}
                required
                className="input"
                value={v.reward_threshold}
                onChange={set("reward_threshold")}
              />
            </div>
          </div>
          <div>
            <label htmlFor="reward_description" className="label">
              Cadeau *
            </label>
            <input
              id="reward_description"
              name="reward_description"
              required
              className="input"
              value={v.reward_description}
              onChange={set("reward_description")}
              placeholder="1 pain au chocolat offert"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {(
              [
                ["background_color", "Fond"],
                ["foreground_color", "Texte"],
                ["label_color", "Titres"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={key} className="label">
                  {label}
                </label>
                <input
                  id={key}
                  name={key}
                  type="color"
                  className="h-11 w-full rounded-lg border border-gray-300 cursor-pointer"
                  value={v[key]}
                  onChange={set(key)}
                />
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="back_text" className="label">
              Texte au dos de la carte
            </label>
            <textarea
              id="back_text"
              name="back_text"
              rows={3}
              className="input"
              defaultValue={program?.back_text ?? ""}
              placeholder="Horaires : lun-sam 6h-19h. Instagram : @boulangerie"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="max_stamps_per_day" className="label">
                Tampons max par jour et par client
              </label>
              <input
                id="max_stamps_per_day"
                name="max_stamps_per_day"
                type="number"
                min={1}
                max={10}
                className="input"
                defaultValue={program?.max_stamps_per_day ?? 1}
              />
              <p className="hint">Anti-triche. 1 est conseillé.</p>
            </div>
            <div>
              <label htmlFor="max_notifications_per_week" className="label">
                Notifications max par semaine
              </label>
              <input
                id="max_notifications_per_week"
                name="max_notifications_per_week"
                type="number"
                min={0}
                max={7}
                className="input"
                defaultValue={business?.max_notifications_per_week ?? 2}
              />
              <p className="hint">2 est conseillé. 0 = notifications coupées.</p>
            </div>
          </div>
        </fieldset>

        {state.error && <p className="alert-error">{state.error}</p>}
        {state.ok && <p className="alert-ok">{state.ok}</p>}
        <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">
          {pending
            ? "Enregistrement..."
            : business
              ? "Enregistrer les modifications"
              : "Créer l'entreprise et sa carte"}
        </button>
      </div>

      <div className="space-y-6 lg:sticky lg:top-6 self-start">
        {(["apple", "google"] as const).map((platform) => (
          <CardPreview
            key={platform}
            platform={platform}
            businessName={v.name}
            programName={v.program_name}
            reward={v.reward_description}
            threshold={v.reward_threshold}
            stamps={Math.min(3, v.reward_threshold)}
            customerName="Marie"
            backgroundColor={v.background_color}
            foregroundColor={v.foreground_color}
            labelColor={v.label_color}
            logoUrl={logoPreview}
          />
        ))}
      </div>
    </form>
  );
}
