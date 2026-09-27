import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold">Cartes de fidélité digitales</h1>
      <p className="text-gray-600 max-w-md">
        Des cartes de fidélité dans Apple Wallet et Google Wallet pour les commerces de Guadeloupe.
      </p>
      <Link href="/admin" className="btn btn-primary">
        Accès administrateur
      </Link>
      <Link href="/confidentialite" className="text-sm underline text-gray-600">
        Confidentialité
      </Link>
    </main>
  );
}
