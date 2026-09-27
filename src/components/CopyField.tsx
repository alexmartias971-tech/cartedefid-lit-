"use client";

import { useState } from "react";

/** Affiche un lien avec un bouton "Copier". */
export default function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="input text-sm font-mono" onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="btn btn-secondary text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        {copied ? "Copié ✓" : "Copier"}
      </button>
    </div>
  );
}
