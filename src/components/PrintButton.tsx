"use client";

export default function PrintButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      Imprimer / Enregistrer en PDF
    </button>
  );
}
