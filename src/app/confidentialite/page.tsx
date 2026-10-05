// Politique de confidentialité vue par les clients des commerces (porteurs de carte).
// Version longue, côté site : https://walty.fr/porteurs

export const metadata = { title: "Confidentialité" };

export default function Confidentialite() {
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4 leading-relaxed">
      <h1 className="text-3xl font-bold">Tes données</h1>
      <p className="text-sm text-gray-500">Version v2 · 4 octobre 2026</p>

      <h2 className="text-xl font-semibold">Qui traite tes données ?</h2>
      <p>
        Le commerce qui t’a proposé la carte de fidélité est responsable de tes données. La carte est fournie par Walty,
        exploité par Alexandre MARTIAS, entrepreneur individuel (EI), 486 rue de l’Aviation, 97190 Le Gosier, Guadeloupe,
        SIRET 103 900 692 00015, qui agit comme sous-traitant pour le compte du commerce et n’utilise tes données pour
        rien d’autre.
      </p>

      <h2 className="text-xl font-semibold">Quelles données ?</h2>
      <p>
        Prénom, nom (facultatif), email et/ou téléphone, date de naissance (facultative), tampons, points ou cashback,
        dates de passage, tes choix (offres, classement s’il y en a un) et un identifiant technique de la carte fourni par
        Apple ou Google. Ta position n’est jamais collectée.
      </p>

      <h2 className="text-xl font-semibold">Pourquoi ?</h2>
      <p>
        Faire fonctionner ta carte et tes récompenses, et t’envoyer les messages de service (« +1 tampon », « ton cadeau
        est prêt »). Si tu as coché la case, t’envoyer aussi les offres du commerce par notification : leur nombre est
        limité par la formule du commerce, et la case n’est jamais cochée d’avance. Si tu donnes ta date de naissance, te
        faire une surprise le jour J.
      </p>

      <h2 className="text-xl font-semibold">Pour ne plus recevoir les offres</h2>
      <p>
        Demande-le au commerce ou écris à contact@walty.fr : tu continues à recevoir les messages de ta carte. Tu peux
        aussi couper les notifications dans les réglages de la carte, dans ton Wallet (cela coupe aussi les messages de
        service), ou supprimer la carte de ton téléphone.
      </p>

      <h2 className="text-xl font-semibold">Combien de temps ?</h2>
      <p>Tant que tu utilises la carte, puis au maximum 3 ans après ta dernière visite.</p>

      <h2 className="text-xl font-semibold">Où ?</h2>
      <p>
        Les données sont stockées dans l’Union européenne (Irlande, chez Supabase). Le service tourne chez Vercel, et
        Apple ou Google affichent la carte dans ton Wallet. Tes données ne sont jamais vendues.
      </p>

      <h2 className="text-xl font-semibold">Tes droits</h2>
      <p>
        Tu peux consulter, corriger ou supprimer tes données, et retirer ton accord pour les offres à tout moment, en
        écrivant au commerce ou à contact@walty.fr. Réponse sous un mois. Tu peux saisir la CNIL (cnil.fr) en cas de
        désaccord.
      </p>

      <p className="text-sm text-gray-500">
        Tous les détails :{" "}
        <a href="https://walty.fr/porteurs" className="underline">
          walty.fr/porteurs
        </a>
      </p>
    </main>
  );
}
