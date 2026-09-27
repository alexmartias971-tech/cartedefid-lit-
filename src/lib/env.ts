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

/** Adresse publique de l'application, sans "/" à la fin. */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
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
