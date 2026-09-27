"use client";

import { useState, useTransition } from "react";

/** Bouton en deux temps : un premier clic demande confirmation, le second exécute. */
export default function ConfirmButton({
  label,
  confirmLabel = "Oui, confirmer",
  onConfirm,
  variant = "danger",
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown>;
  variant?: "danger" | "secondary" | "primary";
}) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  if (!asking) {
    return (
      <button type="button" className={`btn btn-${variant} text-sm py-1.5`} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex gap-2">
      <button
        type="button"
        disabled={pending}
        className="btn btn-danger text-sm py-1.5"
        onClick={() =>
          start(async () => {
            await onConfirm();
            setAsking(false);
          })
        }
      >
        {pending ? "..." : confirmLabel}
      </button>
      <button type="button" className="btn btn-secondary text-sm py-1.5" onClick={() => setAsking(false)}>
        Annuler
      </button>
    </span>
  );
}
