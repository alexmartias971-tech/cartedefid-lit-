"use client";
import { useState } from "react";

/** Bouton "Partager" : ouvre le partage du téléphone (WhatsApp, SMS…) ou copie le lien. */
export default function ShareButton({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* partage annulé */
    }
  }
  return (
    <button type="button" onClick={share} className="btn btn-primary w-full">
      {copied ? "Lien copié ✓" : "Partager mon lien"}
    </button>
  );
}
