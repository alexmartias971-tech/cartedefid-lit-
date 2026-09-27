import "server-only";
import http2 from "node:http2";
import { requireBase64Env, requireEnv, isAppleConfigured } from "@/lib/env";

/**
 * Prévient les iPhone qu'une carte a changé (APNs).
 * Le message envoyé est vide : l'iPhone vient ensuite chercher la nouvelle carte
 * sur notre serveur, et affiche la notification si un champ "changeMessage" a changé.
 */
export async function pushToAppleDevices(pushTokens: string[]): Promise<{ sent: number; invalid: string[] }> {
  const tokens = [...new Set(pushTokens)];
  if (tokens.length === 0 || !isAppleConfigured()) return { sent: 0, invalid: [] };

  const client = http2.connect("https://api.push.apple.com", {
    cert: requireBase64Env("APPLE_PASS_CERT_BASE64"),
    key: requireBase64Env("APPLE_PASS_KEY_BASE64"),
    passphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || undefined,
  });
  const topic = requireEnv("APPLE_PASS_TYPE_ID");
  const invalid: string[] = [];
  let sent = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", reject);
    });

    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const req = client.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              "apns-topic": topic,
              "content-type": "application/json",
            });
            req.setEncoding("utf8");
            req.on("response", (headers) => {
              const status = Number(headers[":status"]);
              if (status === 200) sent++;
              else if (status === 410 || status === 400)
                invalid.push(token); // iPhone qui a supprimé la carte
              else console.error(`[APNs] statut ${status} pour un appareil`);
            });
            req.on("data", () => {});
            req.on("end", () => resolve());
            req.on("error", (err) => {
              console.error("[APNs] erreur", err.message);
              resolve();
            });
            req.end("{}");
          }),
      ),
    );
  } catch (err) {
    console.error("[APNs] connexion impossible :", (err as Error).message);
  } finally {
    client.close();
  }

  return { sent, invalid };
}
