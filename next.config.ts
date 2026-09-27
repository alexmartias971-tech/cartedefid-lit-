import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ces modules tournent uniquement côté serveur (fabrication des cartes Apple, images)
  serverExternalPackages: ["passkit-generator", "sharp"],
  experimental: {
    // Permet d'envoyer un logo jusqu'à 4 Mo depuis le tableau de bord
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
