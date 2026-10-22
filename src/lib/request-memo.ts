import "server-only";

/**
 * Mémoïsation « le temps d'UNE demande » (espace commerçant) : la même vérification (badge de session, rôle gérant)
 * n'interroge la base qu'une fois par demande, même si plusieurs fonctions la demandent.
 * - La portée est l'objet cookies() de la demande en cours (propre à chaque demande, libéré avec elle) ;
 * - la clé contient la valeur exacte des cookies : un cookie différent = une nouvelle vérification ;
 * - par prudence, une valeur de plus de MAX_AGE_MS est recalculée (une demande dure bien moins longtemps) :
 *   un accès désactivé ne peut donc jamais rester accepté grâce à cette mémoire.
 * Rien n'est gardé d'une demande à l'autre.
 */
const MAX_AGE_MS = 10_000;
const memo = new WeakMap<object, Map<string, { at: number; pending: Promise<unknown> }>>();

export function perRequest<T>(scope: object, key: string, run: () => Promise<T>): Promise<T> {
  let entries = memo.get(scope);
  if (!entries) {
    entries = new Map();
    memo.set(scope, entries);
  }
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.pending as Promise<T>;
  const pending = run();
  entries.set(key, { at: Date.now(), pending });
  // une erreur ne reste pas en mémoire : la prochaine demande réessaie
  pending.catch(() => entries!.delete(key));
  return pending;
}
