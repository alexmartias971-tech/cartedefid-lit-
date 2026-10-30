import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ces modules tournent uniquement côté serveur (fabrication des cartes Apple, images, envoi des e-mails par la boîte OVH)
  serverExternalPackages: ["passkit-generator", "sharp", "nodemailer"],
  experimental: {
    // Permet d'envoyer un logo jusqu'à 4 Mo depuis le tableau de bord
    serverActions: { bodySizeLimit: "4mb" },
  },
  // Adresse courte d'inscription : carte.walty.fr/ady-coffee-shop = la page /c/ady-coffee-shop (l'adresse reste affichée).
  // « fallback » : seulement quand aucune page ni aucun fichier ne répond déjà (admin, carte, m, login… gardent la priorité).
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [{ source: "/:slug([a-z0-9][a-z0-9-]{0,59})", destination: "/c/:slug" }],
    };
  },
};

export default nextConfig;
