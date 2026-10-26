import { NextResponse } from "next/server";

/**
 * Le manifeste d'une page qu'on met sur l'écran d'accueil du téléphone (26 oct. 2026). Avant, toutes les pages partageaient
 * celui du site (adresse de départ « / ») : une caisse ou une carte ajoutée à l'écran d'accueil rouvrait la page d'accueil
 * du site. Ici, l'adresse de départ est la page elle-même (start_url, scope et id), avec un nom qui dit ce que c'est.
 */
export function webManifest(o: { name: string; shortName: string; start: string; theme: string; background: string }) {
  return NextResponse.json(
    {
      id: o.start,
      name: o.name.slice(0, 60),
      short_name: o.shortName.slice(0, 24),
      start_url: o.start,
      scope: o.start,
      display: "standalone",
      background_color: o.background,
      theme_color: o.theme,
      icons: [
        { src: "/walty-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/walty-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=300" } },
  );
}
