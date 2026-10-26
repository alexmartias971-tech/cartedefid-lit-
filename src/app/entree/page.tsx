import type { Metadata } from "next";
import EntreeCaisse from "./EntreeCaisse";

export const metadata: Metadata = { title: "Entrée Walty", robots: { index: false, follow: false } };

/** Entrée Walty dans une caisse (lien ouvert depuis le CRM : carte.walty.fr/entree#jeton=…). */
export default function EntreePage() {
  return <EntreeCaisse />;
}
