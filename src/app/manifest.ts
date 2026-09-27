import type { MetadataRoute } from "next";

// Permet au commerçant d'installer son espace sur l'écran d'accueil de son téléphone
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Espace fidélité",
    short_name: "Fidélité",
    description: "Scanner les cartes de fidélité et envoyer des notifications",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f6",
    theme_color: "#0b6474",
    icons: [{ src: "/icon-app.png", sizes: "512x512", type: "image/png" }],
  };
}
