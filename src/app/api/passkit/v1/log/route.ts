/** Apple envoie ici ses messages d'erreur : ils apparaissent dans les logs de l'hébergeur. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { logs?: string[] };
  for (const line of body.logs ?? []) console.warn("[Apple Wallet]", line);
  return new Response(null, { status: 200 });
}
