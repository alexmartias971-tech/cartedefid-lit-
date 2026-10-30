import "server-only";
import { computeCardState } from "@/lib/card-state";
import { publicUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardBundle } from "@/lib/types";

/**
 * Relance par e-mail des clients qui n'ont PAS la carte dans leur téléphone (ni iPhone, ni Android) : sans Wallet, aucune
 * notification ne leur arrive (demande d'Alexandre, 29 oct. 2026 ; Cocokard relance déjà par e-mail).
 * Seulement les clients qui ont accepté les e-mails de CE commerce (table email_optins : case jamais cochée d'avance, à
 * l'inscription ou sur la page de leur carte), qui acceptent toujours les bons plans (marketing_optin) et ne se sont pas
 * désabonnés. Les messages de service (« +1 tampon ») ne partent jamais par e-mail : seulement les relances envoyées à
 * plusieurs cartes (message du commerçant, offre, « Tu nous manques », rappel du défi), voir syncCards.
 * Envoi par Brevo (société française, serveurs en Europe) : BREVO_API_KEY et EMAIL_FROM dans Vercel. Sans eux, rien ne part.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

export type MessageEmail = { header: string; body: string };
type Optin = { customer_id: string; email: string };

/** Une adresse e-mail plausible (le reste, c'est Brevo qui le dira). */
export const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Les cartes à relancer par e-mail : pas dans un Wallet, client d'accord pour les bons plans et pour les e-mails.
 * « Pas dans un Wallet » : aucun iPhone inscrit pour la carte, et le bouton Google jamais touché (google_saved).
 * Un client Android qui a touché le bouton Google sans aller au bout est compté comme équipé : il ne reçoit pas d'e-mail.
 */
export function destinatairesEmail(bundles: CardBundle[], optins: Optin[], dansIphone: Set<string>) {
  const parClient = new Map(optins.map((o) => [o.customer_id, o.email]));
  return bundles.flatMap((b) => {
    const email = parClient.get(b.customer.id);
    if (!email || !EMAIL_OK.test(email) || !b.customer.marketing_optin) return [];
    if (b.card.google_saved || dansIphone.has(b.card.id)) return [];
    return [{ bundle: b, email }];
  });
}

const echap = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const couleur = (c: string | null | undefined, defaut: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : defaut);
/** Le lien de désabonnement (le lien de la carte sert de clé, comme pour voir la carte). */
export const lienDesabo = (webToken: string) => `${publicUrl()}/api/email/desabo?c=${webToken}`;

/** Sujet, HTML et texte de l'e-mail d'une carte (pur : testé au banc). */
export function emailContenu(b: CardBundle, message: MessageEmail) {
  const nom = b.business.name;
  const prenom = b.customer.first_name;
  const carte = `${publicUrl()}/carte/${b.card.web_token}`;
  const desabo = lienDesabo(b.card.web_token);
  const fond = couleur(b.program.background_color, "#140C1F");
  const encre = couleur(b.program.foreground_color, "#FFFFFF");
  const etat = computeCardState(b.program, b.card, b.tiers, b.catalog).sentence;
  const texte = message.body.replace(/⁠/g, "").trim();
  const sujet = texte.length > 90 ? `${texte.slice(0, 89)}…` : texte;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${echap(nom)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${fond};color:${encre};padding:20px 24px;font-size:20px;font-weight:bold">${echap(nom)}</td></tr>
<tr><td style="padding:24px 24px 8px;font-size:17px;line-height:1.5">Bonjour ${echap(prenom)},<br><br>${echap(texte).replace(/\n/g, "<br>")}</td></tr>
<tr><td style="padding:8px 24px 20px;font-size:15px;line-height:1.5;color:#52525b">${echap(etat)}</td></tr>
<tr><td style="padding:0 24px 28px"><a href="${carte}" style="display:inline-block;background:${fond};color:${encre};text-decoration:none;font-weight:bold;font-size:16px;padding:14px 22px;border-radius:12px">Voir ma carte</a></td></tr>
<tr><td style="padding:16px 24px 20px;font-size:12px;line-height:1.5;color:#71717a;border-top:1px solid #e4e4e7">
Astuce : ajoute ta carte à ton téléphone (Apple Wallet ou Google Wallet) depuis la page de ta carte, tu seras prévenu directement.<br><br>
Tu reçois cet e-mail parce que tu as accepté de recevoir les bons plans de ${echap(nom)} par e-mail.
<a href="${desabo}" style="color:#71717a">Ne plus recevoir ces e-mails</a>.<br>Carte de fidélité proposée par Walty.</td></tr>
</table></td></tr></table></body></html>`;
  const brut = [
    `Bonjour ${prenom},`,
    "",
    texte,
    "",
    etat,
    "",
    `Voir ma carte : ${carte}`,
    "",
    "Astuce : ajoute ta carte à ton téléphone (Apple Wallet ou Google Wallet) depuis la page de ta carte, tu seras prévenu directement.",
    "",
    `Tu reçois cet e-mail parce que tu as accepté de recevoir les bons plans de ${nom} par e-mail.`,
    `Ne plus recevoir ces e-mails : ${desabo}`,
    "Carte de fidélité proposée par Walty.",
  ].join("\n");
  return { sujet, html, texte: brut };
}

/** Un e-mail par Brevo. true s'il est accepté. */
async function envoyer(email: string, b: CardBundle, message: MessageEmail): Promise<boolean> {
  const { sujet, html, texte } = emailContenu(b, message);
  const replyTo = b.business.email && EMAIL_OK.test(b.business.email) ? { email: b.business.email, name: b.business.name.slice(0, 70) } : null;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: b.business.name.slice(0, 70), email: process.env.EMAIL_FROM },
      to: [{ email, name: b.customer.first_name.slice(0, 70) }],
      ...(replyTo ? { replyTo } : {}),
      subject: sujet,
      htmlContent: html,
      textContent: texte,
      tags: ["relance-sans-wallet"],
    }),
  });
  if (!res.ok) {
    console.error("[email]", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return false;
  }
  return true;
}

/**
 * Envoie le message par e-mail aux clients de ces cartes qui n'ont pas la carte dans leur téléphone.
 * Renvoie le nombre d'e-mails acceptés par Brevo. Une panne ne bloque jamais l'envoi Wallet (appelé après lui).
 */
export async function relanceParEmail(bundles: CardBundle[], message: MessageEmail): Promise<number> {
  if (!isEmailConfigured() || bundles.length === 0) return 0;
  const supabase = createAdminClient();
  const [optins, regs] = await Promise.all([
    supabase.from("email_optins").select("customer_id, email").in("customer_id", [...new Set(bundles.map((b) => b.customer.id))]).is("unsubscribed_at", null),
    supabase.from("apple_device_registrations").select("card_id").in("card_id", bundles.map((b) => b.card.id)),
  ]);
  const erreur = optins.error ?? regs.error;
  if (erreur) {
    console.error("[email]", erreur.message);
    return 0;
  }
  const cibles = destinatairesEmail(
    bundles,
    (optins.data ?? []) as Optin[],
    new Set(((regs.data ?? []) as { card_id: string }[]).map((r) => r.card_id)),
  );
  let envoyes = 0;
  // 5 à la fois (Brevo gratuit : 300 e-mails par jour au total)
  for (let i = 0; i < cibles.length; i += 5) {
    const lot = cibles.slice(i, i + 5);
    const res = await Promise.allSettled(lot.map((c) => envoyer(c.email, c.bundle, message)));
    const partis = lot.filter((_, k) => res[k].status === "fulfilled" && (res[k] as PromiseFulfilledResult<boolean>).value);
    envoyes += partis.length;
    if (partis.length) {
      await supabase
        .from("email_optins")
        .update({ last_sent_at: new Date().toISOString() })
        .in("customer_id", partis.map((c) => c.bundle.customer.id));
    }
  }
  return envoyes;
}
