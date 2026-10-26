import "server-only";

/** Lit une variable d'environnement obligatoire, avec un message clair si elle manque. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Ajoute-la dans .env.local (ou chez ton hébergeur), puis redémarre.`,
    );
  }
  return value;
}

/** Lit une variable encodée en base64 et renvoie son contenu. */
export function requireBase64Env(name: string): Buffer {
  return Buffer.from(requireEnv(name).trim(), "base64");
}

/**
 * Adresse technique de l'application, sans "/" à la fin : mises à jour des cartes installées (webServiceURL d'Apple),
 * images servies à Google, API. Elle ne doit plus changer : les cartes déjà dans les téléphones l'ont gardée.
 */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Adresse des liens que voient les clients et les commerçants (ex. https://carte.walty.fr), sans "/" à la fin.
 * Variable NEXT_PUBLIC_CARTE_URL ; sans elle, l'adresse technique (rien ne change tant qu'elle n'est pas posée).
 */
export function publicUrl(): string {
  return (process.env.NEXT_PUBLIC_CARTE_URL || appUrl()).trim().replace(/\/+$/, "");
}

/** Lien d'inscription d'un commerce : court avec l'adresse publique (carte.walty.fr/ady-coffee-shop), sinon /c/slug. */
export function signupUrl(slug: string, referral?: string | null): string {
  const base = process.env.NEXT_PUBLIC_CARTE_URL ? `${publicUrl()}/${slug}` : `${appUrl()}/c/${slug}`;
  return referral ? `${base}?p=${referral}` : base;
}

export function isAppleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_PASS_TYPE_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_PASS_CERT_BASE64 &&
    process.env.APPLE_PASS_KEY_BASE64 &&
    process.env.APPLE_WWDR_BASE64,
  );
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_SERVICE_ACCOUNT_BASE64);
}
