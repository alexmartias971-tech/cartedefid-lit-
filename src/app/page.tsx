/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

const FEATURES = [
  { icon: "📱", title: "Apple Wallet & Google Wallet", text: "La carte vit dans le téléphone du client. Rien à télécharger, elle s'ajoute en un geste depuis un QR code." },
  { icon: "🎨", title: "Un design unique par commerce", text: "Vraies photos, couleurs de la marque, circuit néon, verre dépoli… La carte change même de photo à chaque niveau." },
  { icon: "🛡️", title: "Zéro triche", text: "Seul le commerçant ajoute les passages, depuis son scanner protégé par un code PIN. Limite par jour intégrée." },
  { icon: "🔔", title: "Des notifications qui font revenir", text: "Offres programmées, anniversaire, « tu nous manques », rappel de série, carte qui s'affiche près du commerce." },
  { icon: "🏆", title: "Niveaux, séries et classement", text: "Rookie → Légende, bonus quand on revient chaque semaine, records et classement pour les commerces sportifs." },
  { icon: "📊", title: "Un tableau de bord simple", text: "Clients, passages, récompenses, export, accès commerçant : tout est au même endroit." },
];

const STEPS = [
  { n: "1", title: "Le client scanne le QR du comptoir", text: "Il s'inscrit en 30 secondes et ajoute sa carte à son Wallet." },
  { n: "2", title: "Le commerçant scanne sa carte", text: "À chaque visite : +1 tampon / secteur / point, en un clic." },
  { n: "3", title: "La carte se met à jour toute seule", text: "Progression, niveau, récompense, record : le téléphone du client est mis à jour en quelques secondes." },
];

export default function Home() {
  return (
    <main className="flex-1 bg-[#0c1417] text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(900px_400px_at_10%_-10%,rgba(11,100,116,.55),transparent),radial-gradient(700px_400px_at_100%_0%,rgba(255,122,0,.25),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-5 pt-14 pb-10 grid lg:grid-cols-[1fr_1.1fr] gap-10 items-center">
          <div className="space-y-6">
            <p className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide">🌴 Fait en Guadeloupe</p>
            <h1 className="text-4xl sm:text-5xl font-black leading-tight">
              Des cartes de fidélité qui donnent <span className="text-[#FF9A3C]">envie de revenir</span>.
            </h1>
            <p className="text-lg text-white/75">
              Des cartes digitales pour Apple Wallet et Google Wallet, dessinées sur mesure pour chaque commerce : photos, niveaux,
              séries, classement… et des notifications qui ramènent les clients.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin" className="btn bg-[#FF7A00] text-black hover:bg-[#ff8f26]">Accès administrateur</Link>
              <a href="#comment" className="btn bg-white/10 text-white hover:bg-white/15">Comment ça marche</a>
            </div>
          </div>
          <img src="/demo/showcase-kkc.jpg" alt="Exemple : la carte Pass Pilote sur iPhone et Android" className="w-full rounded-3xl shadow-2xl ring-1 ring-white/10" />
        </div>
      </section>

      <section id="comment" className="mx-auto max-w-6xl px-5 py-14 space-y-8">
        <h2 className="text-3xl font-black">Comment ça marche</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-[#0b6474] font-black">{s.n}</div>
              <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-white/70">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-14 space-y-8">
        <h2 className="text-3xl font-black">Tout ce qu&apos;il faut pour fidéliser</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-2 font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-white/70">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 grid lg:grid-cols-2 gap-6">
        <figure className="space-y-2">
          <img src="/demo/showcase-licences.jpg" alt="Les 4 niveaux de la carte, chacun avec sa photo" className="rounded-2xl ring-1 ring-white/10" />
          <figcaption className="text-sm text-white/60">Chaque niveau a sa photo : le client voit sa progression.</figcaption>
        </figure>
        <figure className="space-y-2">
          <img src="/demo/showcase-classement.jpg" alt="Circuit par secteurs, classement et alertes" className="rounded-2xl ring-1 ring-white/10" />
          <figcaption className="text-sm text-white/60">Circuit par secteurs, classement et alertes « tu t&apos;es fait dépasser ».</figcaption>
        </figure>
      </section>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-white/50">
        <Link href="/confidentialite" className="underline">Confidentialité</Link>
      </footer>
    </main>
  );
}
