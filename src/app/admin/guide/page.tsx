import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Guide" };

const JOURNEY = [
  { n: "1", icon: "📷", title: "Le client s'inscrit", text: "Il scanne le QR du comptoir (kit de lancement), donne son prénom et son email ou téléphone, et ajoute la carte à Apple Wallet ou Google Wallet." },
  { n: "2", icon: "✅", title: "Le commerçant scanne", text: "À chaque visite, le commerçant ouvre son lien « scanner » (avec son code PIN), scanne le QR de la carte et appuie sur « + 1 »." },
  { n: "3", icon: "⚡", title: "Tout se recalcule", text: "Le serveur ajoute le passage, recalcule la progression, le niveau, la série… en vérifiant les limites anti-triche." },
  { n: "4", icon: "📲", title: "La carte se met à jour", text: "Apple et Google sont prévenus : en quelques secondes, la carte change dans le téléphone du client, avec une notification si besoin." },
];

const UPDATES: { what: string; how: string; who: string }[] = [
  { what: "Tampons / secteurs / points", how: "+1 à chaque scan « Ajouter » (ou selon le montant en mode points / cashback). Limite par jour réglable.", who: "Commerçant (scan) → automatique" },
  { what: "Récompense", how: "Quand le compteur est plein, le scanner affiche « Cadeau débloqué ». Le commerçant valide quand il le remet : le compteur repart à zéro.", who: "Commerçant (validation)" },
  { what: "Niveau (Rookie, Pilote…)", how: "Calculé tout seul à partir du nombre total de passages (ou des € dépensés) depuis l'inscription. La photo et la couleur changent au passage de niveau.", who: "Automatique" },
  { what: "Série de semaines 🔥", how: "Au 1er passage de la semaine (lundi → dimanche), la série augmente. Semaine sautée = retour à 1. Bonus automatique tous les X semaines.", who: "Automatique" },
  { what: "Rappel de série", how: "Le jour et l'heure choisis (ex. dimanche 11 h), les clients qui ne sont pas encore venus reçoivent « Ta série s'arrête ce soir ».", who: "Automatique (toutes les 5 min)" },
  { what: "Record ⏱️", how: "Après la session, le commerçant tape le meilleur tour du client dans le scanner (ex. 38,412). S'il est meilleur que l'ancien, il remplace le record.", who: "Commerçant (saisie)" },
  { what: "Classement P1, P2…", how: "Recalculé automatiquement à chaque nouveau record, pour tous les pilotes. Ceux qui sont dépassés reçoivent une alerte.", who: "Automatique" },
  { what: "Notifications d'offres", how: "Toi (tableau de bord) ou le commerçant (onglet Notifications du scanner) : tout de suite, à une date, ou répétées. Limite par semaine.", who: "Toi / commerçant" },
  { what: "Anniversaire, « tu nous manques »", how: "Offre ajoutée le jour de l'anniversaire ; message après 30 jours d'absence.", who: "Automatique (chaque jour)" },
];

const SETTINGS: { where: string; items: string }[] = [
  { where: "Section 2 · Comment le client gagne", items: "Mode (tampons, points, cashback), nombre de passages pour la récompense (ex. 8 secteurs), la récompense, limite de passages par jour." },
  { where: "Section 3 · Design", items: "Photo principale, couleurs, style de progression (verre, points, circuit néon), icônes, textes de la carte (ex. « SECTEURS », « PILOTE »)." },
  { where: "Section 4 · Niveaux", items: "Nom de chaque niveau, à partir de combien de passages ou d'€ dépensés, l'avantage, la couleur et la photo du niveau. Utilise les boutons de l'aperçu pour voir chaque niveau." },
  { where: "Section 5 · Boosters", items: "Bonus d'inscription, heures boostées (désactivées si « Désactivé »), série de la semaine, record + classement, parrainage." },
  { where: "Section 6 · Offres", items: "Offre de bienvenue, offre d'anniversaire, nombre maximum de notifications par semaine." },
];

const GLOSSARY: { term: string; def: string }[] = [
  { term: "Secteur", def: "Avec le style « circuit néon », un passage = un secteur du circuit qui s'allume. Tous les secteurs = le tour est bouclé = la récompense." },
  { term: "Tour", def: "Une carte complète (ex. 8 secteurs). Après la récompense, un nouveau tour commence." },
  { term: "Série", def: "Le nombre de semaines d'affilée où le client est venu au moins une fois." },
  { term: "Niveau / licence", def: "Le rang du client selon sa fidélité totale (Rookie, Pilote, Pro, Légende…). Il ne redescend jamais." },
  { term: "Record", def: "Le meilleur temps au tour du client, saisi par le commerçant." },
  { term: "Classement", def: "La position du client parmi tous les pilotes qui ont un record (P1 = le plus rapide). Page publique : /classement/nom-du-commerce." },
];

export default async function GuidePage() {
  await requireAdmin();
  return (
    <div className="space-y-10">
      <header className="rounded-3xl bg-[#15262b] p-6 sm:p-8 text-white">
        <p className="text-xs font-bold tracking-widest text-[#7fd1db]">GUIDE</p>
        <h1 className="text-3xl sm:text-4xl font-black mt-1">Comment fonctionnent tes cartes</h1>
        <p className="mt-2 max-w-2xl text-white/75">
          Tu règles la carte une fois. Ensuite, tout se met à jour automatiquement à chaque scan du commerçant : progression,
          niveau, série, classement et notifications.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-black">Le parcours, du comptoir au téléphone</h2>
        <ol className="grid md:grid-cols-4 gap-3">
          {JOURNEY.map((s, i) => (
            <li key={s.n} className="relative panel">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--lagon)] text-white font-black">{s.n}</span>
                <span className="text-2xl">{s.icon}</span>
              </div>
              <h3 className="mt-2 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{s.text}</p>
              {i < JOURNEY.length - 1 && <span className="hidden md:block absolute -right-3 top-1/2 text-2xl text-gray-300">›</span>}
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-black">Qui met à jour quoi ?</h2>
        <div className="overflow-hidden rounded-2xl border border-[#dde7e5] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#eef6f7] text-left">
              <tr>
                <th className="p-3">Sur la carte</th>
                <th className="p-3">Comment ça se met à jour</th>
                <th className="p-3 whitespace-nowrap">Qui</th>
              </tr>
            </thead>
            <tbody>
              {UPDATES.map((u) => (
                <tr key={u.what} className="border-t border-[#eef2f1] align-top">
                  <td className="p-3 font-semibold">{u.what}</td>
                  <td className="p-3 text-gray-700">{u.how}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${u.who.startsWith("Automatique") ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"}`}>
                      {u.who}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="panel space-y-3">
          <h2 className="text-2xl font-black">⏱️ Et le chronométrage automatique ?</h2>
          <p className="text-sm text-gray-700">
            Aujourd&apos;hui, le record est <b>tapé par le commerçant</b> dans le scanner après la session (10 secondes : il lit le meilleur
            tour sur l&apos;écran de chronométrage). Le classement, lui, est 100 % automatique.
          </p>
          <p className="text-sm text-gray-700">
            Pour que les temps arrivent <b>tout seuls</b>, il faut un lien avec le logiciel de chronométrage du circuit (ex. APEX Timing) :
          </p>
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
            <li>le circuit doit accepter de nous donner accès à ses résultats (export ou accès technique) ;</li>
            <li>chaque pilote doit être reconnu (son kart ou son nom saisi au départ doit correspondre à sa carte) ;</li>
            <li>ensuite, un import automatique après chaque session met à jour records, classement et alertes.</li>
          </ul>
          <p className="text-sm text-gray-500">C&apos;est une évolution possible : à discuter avec le circuit.</p>
        </div>
        <div className="panel space-y-3">
          <h2 className="text-2xl font-black">🛠️ Où régler quoi</h2>
          <ul className="space-y-2 text-sm">
            {SETTINGS.map((s) => (
              <li key={s.where}>
                <b>{s.where}</b>
                <span className="block text-gray-600">{s.items}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-gray-500">Chemin : Mes entreprises → la carte → « Modifier les règles et le design ».</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-black">Petit lexique</h2>
        <dl className="grid sm:grid-cols-2 gap-3">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="panel">
              <dt className="font-bold">{g.term}</dt>
              <dd className="text-sm text-gray-600">{g.def}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-center">
        <Link href="/admin" className="btn btn-primary">← Retour à mes entreprises</Link>
      </p>
    </div>
  );
}
