import { createAdminClient } from "@/lib/supabase/admin";

/**
 * « Ne plus recevoir ces e-mails » (lien en bas de chaque e-mail de relance, lib/email.ts).
 * Le lien de la carte (web_token) sert de clé, comme pour voir la carte.
 *  - GET : une page avec un bouton (les logiciels qui ouvrent les liens tout seuls ne désabonnent personne) ;
 *  - POST : le client est désabonné des e-mails de ce commerce. Sa carte et ses notifications Wallet ne changent pas.
 */
const TOKEN = /^[0-9a-f]{32}$/;

const page = (titre: string, texte: string, bouton?: string) =>
  new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${titre}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Arial,sans-serif;background:#f4f4f5;color:#18181b">
<main style="max-width:440px;margin:48px auto;padding:28px 24px;background:#fff;border-radius:16px">
<h1 style="font-size:22px;margin:0 0 12px">${titre}</h1><p style="font-size:16px;line-height:1.5;margin:0">${texte}</p>
${bouton ? `<form method="post" style="margin-top:24px"><button type="submit" style="font-size:16px;font-weight:700;padding:14px 20px;border:0;border-radius:12px;background:#18181b;color:#fff;cursor:pointer">${bouton}</button></form>` : ""}
</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

const echap = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function carte(token: string) {
  const { data } = await createAdminClient()
    .from("cards")
    .select("customer_id, loyalty_programs!inner(businesses!inner(name))")
    .eq("web_token", token)
    .maybeSingle();
  const row = data as { customer_id: string; loyalty_programs: { businesses: { name: string } } } | null;
  return row ? { customerId: row.customer_id, commerce: row.loyalty_programs.businesses.name } : null;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("c") ?? "";
  const c = TOKEN.test(token) ? await carte(token) : null;
  if (!c) return page("Lien expiré", "Ce lien ne correspond à aucune carte. Écris à contact@walty.fr si tu reçois encore des e-mails.");
  return page(
    "Ne plus recevoir ces e-mails ?",
    `Tu ne recevras plus les bons plans de ${echap(c.commerce)} par e-mail. Ta carte de fidélité reste la même.`,
    "Oui, ne plus recevoir ces e-mails",
  );
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("c") ?? "";
  const c = TOKEN.test(token) ? await carte(token) : null;
  if (!c) return page("Lien expiré", "Ce lien ne correspond à aucune carte. Écris à contact@walty.fr si tu reçois encore des e-mails.");
  const { error } = await createAdminClient()
    .from("email_optins")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("customer_id", c.customerId)
    .is("unsubscribed_at", null);
  if (error) {
    console.error("[desabo]", error.message);
    return page("Petit souci", "Le désabonnement n'a pas marché. Réessaie dans un instant, ou écris à contact@walty.fr.", "Réessayer");
  }
  return page("C'est fait", `Tu ne recevras plus les e-mails de ${echap(c.commerce)}. Ta carte de fidélité reste la même.`);
}
