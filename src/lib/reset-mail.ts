import "server-only";

/**
 * E-mail « Choisir un nouveau mot de passe » (espace commerçant de walty.fr), envoyé avec Resend (https://resend.com).
 * Variables : RESEND_API_KEY (obligatoire pour envoyer), RESEND_FROM (facultatif, « Walty <espace@walty.fr> » par défaut),
 * ESPACE_URL (facultatif, https://walty.fr/espace par défaut).
 * Le lien contient le jeton APRÈS le « # » : il n'est jamais envoyé à un serveur ni écrit dans un journal ;
 * la page walty.fr/espace l'efface de la barre d'adresse dès qu'elle l'a lu.
 * Rien de personnel (adresse, jeton) n'est écrit dans les journaux, même en cas d'erreur.
 */
const DEFAULT_FROM = "Walty <espace@walty.fr>";
const DEFAULT_ESPACE = "https://walty.fr/espace";

export function isResetMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function resetLink(token: string) {
  const base = (process.env.ESPACE_URL || DEFAULT_ESPACE).trim().replace(/[#?].*$/, "").replace(/\/+$/, "");
  return `${base}#reinit=${token}`;
}

function buildMail(link: string, businessName: string) {
  const pour = businessName ? ` pour « ${businessName} »` : "";
  const text = [
    "Bonjour,",
    "",
    `Vous avez demandé à changer le mot de passe de votre espace commerçant Walty${pour}.`,
    "Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure, une seule fois) :",
    link,
    "",
    "Vous n'avez rien demandé ? Ignorez simplement cet e-mail : votre mot de passe ne change pas.",
    "",
    "L'équipe Walty",
    "walty.fr",
  ].join("\n");

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nouveau mot de passe</title></head>
<body style="margin:0;padding:0;background:#f4f1fb;font-family:Arial,Helvetica,sans-serif;color:#17132b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1fb;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;">
<tr><td style="background:#ff5b1f;background-image:linear-gradient(115deg,#ffa23d 0%,#ff5b1f 28%,#ff2e7e 62%,#7b3cff 100%);padding:22px 28px;">
<span style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:.5px;">Walty</span>
<span style="font-size:13px;color:#ffffff;opacity:.85;margin-left:8px;">Espace commerçant</span>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#17132b;">Choisissez un nouveau mot de passe</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55;">Bonjour,</p>
<p style="margin:0 0 22px;font-size:16px;line-height:1.55;">Vous avez demandé à changer le mot de passe de votre espace commerçant Walty${esc(pour)}. Cliquez sur le bouton ci-dessous : le lien est valable <strong>1&nbsp;heure</strong> et ne sert qu'une seule fois.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr><td style="border-radius:999px;background:#ff5b1f;background-image:linear-gradient(135deg,#ffb35c 0%,#ff5b1f 55%,#e8305f 100%);">
<a href="${esc(link)}" style="display:inline-block;padding:15px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Choisir un nouveau mot de passe</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5d5876;">Le bouton ne marche pas ? Copiez cette adresse dans votre navigateur :</p>
<p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${esc(link)}" style="color:#e8441a;">${esc(link)}</a></p>
<p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:#5d5876;">Vous n'avez rien demandé ? Ignorez simplement cet e-mail : votre mot de passe ne change pas.</p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #ece8f6;font-size:13px;color:#8a85a3;">L'équipe Walty · <a href="https://walty.fr" style="color:#8a85a3;">walty.fr</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { text, html };
}

/** Envoie l'e-mail. Ne lève jamais d'erreur : en cas de souci, un avertissement sans donnée personnelle. */
export async function sendResetMail(to: string, token: string, businessName: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.warn("[mot de passe oublié] RESEND_API_KEY manquante : l'e-mail de réinitialisation n'est pas envoyé (voir RESEND-A-FAIRE).");
    return false;
  }
  const { text, html } = buildMail(resetLink(token), businessName);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: (process.env.RESEND_FROM || DEFAULT_FROM).trim(),
        to: [to],
        subject: "Votre nouveau mot de passe Walty",
        text,
        html,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[mot de passe oublié] Resend a refusé l'envoi (code ${res.status}). Vérifiez la clé et le domaine walty.fr dans Resend.`);
      return false;
    }
    return true;
  } catch {
    console.warn("[mot de passe oublié] Resend ne répond pas : e-mail non envoyé.");
    return false;
  }
}
