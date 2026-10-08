/**
 * Textes et modèles de l'éditeur (vouvoiement : l'éditeur parle au commerçant).
 * Les textes écrits SUR la carte s'adressent au client : eux restent au tutoiement.
 */
import type { RewardMode } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Modèles par métier : un clic donne une carte complète et cohérente  */
/* ------------------------------------------------------------------ */

export type Trade = {
  id: string;
  label: string;
  emoji: string;
  mode: RewardMode;
  threshold: number;
  reward: string;
  rewardIdeas: string[];
  /** Ambiance (voir AMBIANCES). */
  ambiance: string;
  /** Icône des tampons si le commerçant choisit le style « Icônes ». */
  icon: string;
  /** Pourquoi ce réglage (affiché sous le modèle). */
  why: string;
};

export const TRADES: Trade[] = [
  {
    id: "cafe",
    label: "Café, salon de thé",
    emoji: "☕",
    mode: "stamps",
    threshold: 10,
    reward: "1 boisson offerte",
    rewardIdeas: ["1 boisson offerte", "1 café offert", "1 pâtisserie offerte", "1 iced latte offert"],
    ambiance: "cafe",
    icon: "coffee",
    why: "Vos clients reviennent souvent et dépensent à peu près la même somme : les tampons sont parfaits.",
  },
  {
    id: "boulangerie",
    label: "Boulangerie, pâtisserie",
    emoji: "🥐",
    mode: "stamps",
    threshold: 10,
    reward: "1 viennoiserie offerte",
    rewardIdeas: ["1 viennoiserie offerte", "1 baguette offerte", "1 gâteau individuel offert", "-20 % sur un gâteau"],
    ambiance: "sable",
    icon: "croissant",
    why: "Des passages quotidiens et un petit panier : 10 tampons se remplissent en 2 à 3 semaines.",
  },
  {
    id: "snack",
    label: "Restaurant, snack, bokit",
    emoji: "🍽️",
    mode: "stamps",
    threshold: 8,
    reward: "1 menu offert",
    rewardIdeas: ["1 menu offert", "1 bokit offert", "1 dessert offert", "1 boisson offerte"],
    ambiance: "flamboyant",
    icon: "star",
    why: "Moins de passages qu'un café, mais un cadeau plus gros : 8 passages, c'est atteignable.",
  },
  {
    id: "beaute",
    label: "Coiffure, beauté, ongles",
    emoji: "💇",
    mode: "stamps",
    threshold: 6,
    reward: "-50 % sur la 6e prestation",
    rewardIdeas: ["-50 % sur la 6e prestation", "1 soin offert", "1 brushing offert", "1 pose offerte"],
    ambiance: "hibiscus",
    icon: "scissors",
    why: "Une visite par mois environ : au-delà de 6 cases, la carte paraît trop longue à remplir.",
  },
  {
    id: "sport",
    label: "Sport, loisirs",
    emoji: "🏋️",
    mode: "stamps",
    threshold: 8,
    reward: "1 séance offerte",
    rewardIdeas: ["1 séance offerte", "1 session offerte", "1 cours offert", "1 location offerte"],
    ambiance: "lagon",
    icon: "waves",
    why: "Récompensez la régularité : une séance offerte après 8, et la « série de la semaine » en bonus.",
  },
  {
    id: "boutique",
    label: "Boutique, épicerie",
    emoji: "🛍️",
    mode: "points",
    threshold: 10,
    reward: "",
    rewardIdeas: [],
    ambiance: "nuit",
    icon: "heart",
    why: "Le panier change beaucoup d'un client à l'autre : avec les points, celui qui dépense plus gagne plus.",
  },
  {
    id: "autre",
    label: "Autre commerce",
    emoji: "✨",
    mode: "stamps",
    threshold: 10,
    reward: "",
    rewardIdeas: ["1 produit offert", "-10 % sur l'achat", "1 service offert"],
    ambiance: "crepuscule",
    icon: "star",
    why: "Les tampons sont le plus simple à comprendre pour vos clients : vous pourrez changer plus tard.",
  },
];

/* ------------------------------------------------------------------ */
/*  Les 3 façons de gagner, expliquées simplement                       */
/* ------------------------------------------------------------------ */

export type ModeGuide = {
  value: RewardMode;
  title: string;
  badge?: string;
  /** En une phrase. */
  pitch: string;
  /** Ce qui se passe, dans l'ordre (3 vignettes). */
  how: { emoji: string; text: string }[];
  ideal: string;
  /** Ce que lit le client sur sa carte. */
  client: string;
  watch: string;
};

export const MODE_GUIDES: ModeGuide[] = [
  {
    value: "stamps",
    title: "Tampons",
    badge: "Le plus simple",
    pitch: "Comme la carte en carton, mais dans le téléphone : à chaque passage, un tampon.",
    how: [
      { emoji: "📱", text: "Le client montre sa carte en caisse." },
      { emoji: "✅", text: "Vous la scannez avec votre téléphone : +1 tampon." },
      { emoji: "🎁", text: "Carte pleine : il reçoit son cadeau, puis la carte repart à zéro." },
    ],
    ideal: "Café, boulangerie, coiffeur, lavage auto… quand vos clients dépensent à peu près la même somme à chaque visite.",
    client: "« Plus que 3 passages avant ton cadeau : 1 café offert »",
    watch: "Un cadeau trop lointain décourage : visez une carte remplie en 1 à 2 mois.",
  },
  {
    value: "points",
    title: "Points",
    pitch: "Plus le client dépense, plus il gagne de points, qu'il échange contre les cadeaux de votre liste.",
    how: [
      { emoji: "🧾", text: "En caisse, vous scannez la carte et tapez le montant de l'achat." },
      { emoji: "⭐", text: "Le client gagne des points : par exemple 1 point par euro." },
      { emoji: "🎁", text: "Il échange ses points contre un cadeau de votre liste (100 points = 1 dessert…)." },
    ],
    ideal: "Restaurant, boutique, épicerie… quand le panier varie beaucoup (5 € un jour, 60 € le lendemain).",
    client: "« Plus que 30 points (environ 30 € d'achats) avant ton cadeau : 1 dessert offert »",
    watch: "Il faut taper le montant à chaque passage : comptez quelques secondes de plus en caisse.",
  },
  {
    value: "cashback",
    title: "Cagnotte",
    pitch: "Une partie de chaque achat revient au client en euros, qu'il utilise en réduction quand il veut.",
    how: [
      { emoji: "🧾", text: "En caisse, vous scannez la carte et tapez le montant de l'achat." },
      { emoji: "💶", text: "Un pourcentage (par exemple 5 %) s'ajoute à sa cagnotte." },
      { emoji: "🏷️", text: "Quand il le souhaite, il utilise sa cagnotte en réduction sur un achat." },
    ],
    ideal: "Boutique de vêtements, institut, épicerie fine… des achats plus chers, moins fréquents.",
    client: "« Ta cagnotte : 4,50 € à utiliser quand tu veux »",
    watch: "Chaque euro de cagnotte est une vraie remise : 5 % de cashback = 5 % de vos ventes aux clients fidèles.",
  },
];

/** « Je ne sais pas » : 2 questions pour choisir. */
export const MODE_QUIZ = {
  q1: "Vos clients dépensent-ils à peu près la même somme à chaque visite ?",
  q2: "Préférez-vous offrir des produits (un dessert, un soin…) ou rendre des euros ?",
};

/* ------------------------------------------------------------------ */
/*  Fonds prêts à l'emploi (dégradés continus, sans forme : charte Walty) */
/* ------------------------------------------------------------------ */

export type Ambiance = {
  id: string;
  label: string;
  /** Couleurs de la carte. */
  background_color: string;
  foreground_color: string;
  label_color: string;
  stamp_color: string;
};

export const AMBIANCES: Ambiance[] = [
  { id: "crepuscule", label: "Crépuscule", background_color: "#2A1240", foreground_color: "#FFFFFF", label_color: "#FFC7A8", stamp_color: "#FF8A3D" },
  { id: "flamboyant", label: "Flamboyant", background_color: "#B8321A", foreground_color: "#FFFFFF", label_color: "#FFE0C2", stamp_color: "#FFD166" },
  { id: "hibiscus", label: "Hibiscus", background_color: "#8E1B4F", foreground_color: "#FFFFFF", label_color: "#FFC6DD", stamp_color: "#FFFFFF" },
  { id: "lagon", label: "Lagon", background_color: "#0B6474", foreground_color: "#FFFFFF", label_color: "#CDE7EA", stamp_color: "#FFD166" },
  { id: "cafe", label: "Café", background_color: "#2B1D16", foreground_color: "#F6EBDD", label_color: "#D4B08C", stamp_color: "#E3A15F" },
  { id: "sable", label: "Sable", background_color: "#F3ECE3", foreground_color: "#2B1D16", label_color: "#9A6B43", stamp_color: "#C2410C" },
  { id: "matcha", label: "Matcha", background_color: "#1F3B2C", foreground_color: "#FFFFFF", label_color: "#C9E4B4", stamp_color: "#A7D46F" },
  { id: "nuit", label: "Nuit", background_color: "#121016", foreground_color: "#FFFFFF", label_color: "#BDB4C7", stamp_color: "#E8C872" },
];

/* ------------------------------------------------------------------ */
/*  Bonus : à quoi ça sert, en une phrase                               */
/* ------------------------------------------------------------------ */

export const BONUS_HELP = {
  signup:
    "Le client commence avec des tampons déjà gagnés. Une carte déjà commencée donne envie d'être finie : c'est le réglage le plus efficace pour faire revenir.",
  welcome: "Une petite offre dès l'inscription, à utiliser lors de la prochaine visite. Elle donne une raison de revenir vite.",
  birthday: "Le jour de son anniversaire, le client reçoit une offre valable 30 jours (s'il a donné sa date).",
  referral: "Le client invite un ami avec son lien. À la 1re visite de l'ami, le client gagne des tampons ou des points en plus.",
  happy: "Pendant vos heures calmes, chaque passage compte double (ou triple). Idéal pour remplir le creux de l'après-midi.",
  streak: "Le client gagne un bonus s'il vient au moins une fois par semaine plusieurs semaines d'affilée. Un rappel part le jour choisi.",
  tiers: "Plus le client vient, plus il monte de niveau (Bronze, Argent, Or…). La couleur de sa carte change et il peut avoir un avantage permanent.",
  lap: "Pour le karting et le sport : vous tapez le meilleur temps du client, sa carte affiche son record et sa place au classement.",
};
