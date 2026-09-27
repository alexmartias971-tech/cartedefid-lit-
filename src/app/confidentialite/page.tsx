// ⚠️ TEXTE À COMPLÉTER : remplace tout ce qui est entre [crochets] par tes informations,
// ou colle ici la politique de confidentialité rédigée (et relue par un juriste).

export const metadata = { title: "Confidentialité" };

export default function Confidentialite() {
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4 leading-relaxed">
      <h1 className="text-3xl font-bold">Politique de confidentialité</h1>
      <p className="text-sm text-gray-500">Version v1 · [date]</p>

      <h2 className="text-xl font-semibold">Qui traite tes données ?</h2>
      <p>
        Le commerce qui t’a proposé la carte de fidélité est responsable de tes données. La carte est fournie par [ton
        entreprise], [adresse], SIRET [numéro], qui agit comme sous-traitant pour le compte du commerce.
      </p>

      <h2 className="text-xl font-semibold">Quelles données ?</h2>
      <p>
        Prénom, nom (facultatif), email et/ou téléphone, date de naissance (facultative), nombre de tampons, dates de
        passage, ton choix concernant les offres.
      </p>

      <h2 className="text-xl font-semibold">Pourquoi ?</h2>
      <p>
        Gérer ta carte de fidélité et tes récompenses. Si tu l’as accepté, t’envoyer les offres du commerce par
        notification (2 maximum par semaine).
      </p>

      <h2 className="text-xl font-semibold">Combien de temps ?</h2>
      <p>Tant que tu utilises la carte, puis au maximum 3 ans après ta dernière visite.</p>

      <h2 className="text-xl font-semibold">Où ?</h2>
      <p>Les données sont hébergées dans l’Union européenne.</p>

      <h2 className="text-xl font-semibold">Tes droits</h2>
      <p>
        Tu peux consulter, corriger ou supprimer tes données, et refuser les offres à tout moment, en écrivant à [ton
        email de contact]. Pour couper les notifications, tu peux aussi aller dans les réglages de la carte dans ton
        Wallet. Tu peux saisir la CNIL (cnil.fr) en cas de désaccord.
      </p>
    </main>
  );
}
