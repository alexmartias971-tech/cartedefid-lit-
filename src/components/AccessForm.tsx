"use client";

import { useActionState } from "react";
import { createAccess, type FormState } from "@/app/admin/actions";

/** Création d'un accès commerçant (nom + code PIN). */
export default function AccessForm({ businessId }: { businessId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAccess, {});
  return (
    <form action={action} className="grid sm:grid-cols-[1fr_160px_auto] gap-3 items-end">
      <input type="hidden" name="business_id" value={businessId} />
      <div>
        <label htmlFor="access-label" className="label">
          Nom de l&apos;accès
        </label>
        <input id="access-label" name="label" className="input" placeholder="Téléphone de la caisse" />
      </div>
      <div>
        <label htmlFor="access-pin" className="label">
          Code PIN
        </label>
        <input
          id="access-pin"
          name="pin"
          inputMode="numeric"
          pattern="\d{4,8}"
          required
          className="input"
          placeholder="4 à 8 chiffres"
        />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "..." : "Créer l'accès"}
      </button>
      {state.error && <p className="alert-error sm:col-span-3">{state.error}</p>}
      {state.ok && <p className="alert-ok sm:col-span-3">{state.ok}</p>}
    </form>
  );
}
