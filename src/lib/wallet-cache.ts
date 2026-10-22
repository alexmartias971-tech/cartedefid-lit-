import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Lance une tâche après la réponse (le client n'attend pas), ou l'attend si on n'est pas dans une requête. */
export async function inBackground(task: () => Promise<unknown>): Promise<void> {
  try {
    after(task);
  } catch {
    await task();
  }
}

/**
 * Cache des cartes Wallet (images déjà dessinées, repères Google).
 *  - en mémoire (le serveur garde les derniers résultats tant qu'il reste allumé) ;
 *  - dans Supabase Storage, compartiment privé « pass-cache » (partagé par tous les serveurs, survit aux redémarrages).
 * Les clés sont des empreintes du CONTENU : si la carte change, la clé change, et l'ancienne image n'est plus utilisée.
 * Si le compartiment n'existe pas, tout continue de marcher (simplement sans cache partagé).
 */
export const CACHE_BUCKET = "pass-cache";

/** JSON avec les clés triées (même objet → même texte → même empreinte). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function hashOf(value: unknown, length = 32): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : stableStringify(value))
    .digest("hex")
    .slice(0, length);
}

/** Petit cache mémoire limité en octets (les plus anciens partent en premier). */
export class ByteCache {
  private map = new Map<string, Buffer>();
  private total = 0;
  constructor(private readonly maxBytes: number) {}
  get(key: string): Buffer | undefined {
    const v = this.map.get(key);
    if (v) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, value: Buffer) {
    const old = this.map.get(key);
    if (old) {
      this.total -= old.length;
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.total += value.length;
    for (const [k, v] of this.map) {
      if (this.total <= this.maxBytes || this.map.size <= 1) break;
      this.map.delete(k);
      this.total -= v.length;
    }
  }
}

/** Une seule fabrication à la fois pour une même clé (deux demandes simultanées partagent le résultat). */
const inflight = new Map<string, Promise<unknown>>();
export function once<T>(key: string, make: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = make().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function bucket() {
  return createAdminClient().storage.from(CACHE_BUCKET);
}

/** Lit un fichier du cache partagé (null s'il n'existe pas ou en cas de souci). */
export async function storageGet(path: string): Promise<Buffer | null> {
  try {
    const { data, error } = await bucket().download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** Écrit un fichier dans le cache partagé (les erreurs sont notées, jamais bloquantes). */
export async function storagePut(path: string, body: Buffer, contentType: string): Promise<void> {
  try {
    const { error } = await bucket().upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
    if (error) console.warn("[wallet-cache] écriture impossible", path, error.message);
  } catch (err) {
    console.warn("[wallet-cache] écriture impossible", path, (err as Error).message);
  }
}

/**
 * Ménage : supprime d'un dossier les fichiers d'une ANCIENNE version du design (préfixe différent).
 * Fait au plus une fois par dossier et par version tant que le serveur reste allumé.
 */
const pruned = new Set<string>();
export async function pruneFolder(folder: string, keepPrefix: string): Promise<void> {
  const mark = `${folder}|${keepPrefix}`;
  if (pruned.has(mark)) return;
  pruned.add(mark);
  try {
    const b = bucket();
    const { data, error } = await b.list(folder, { limit: 1000 });
    if (error || !data) return;
    const stale = data.filter((f) => f.id && !f.name.startsWith(keepPrefix)).map((f) => `${folder}/${f.name}`);
    if (stale.length > 0) await b.remove(stale);
  } catch (err) {
    console.warn("[wallet-cache] ménage impossible", folder, (err as Error).message);
  }
}

/**
 * Plusieurs images dans un seul fichier (un seul téléchargement pour toute la carte).
 * Format : "WPS1" + longueur de l'index (4 octets) + index JSON [{ n: nom, s: taille }] + les images à la suite.
 */
export function packFiles(files: Record<string, Buffer>): Buffer {
  const names = Object.keys(files).sort();
  const index = Buffer.from(JSON.stringify(names.map((n) => ({ n, s: files[n].length }))));
  const head = Buffer.alloc(8);
  head.write("WPS1", 0, "ascii");
  head.writeUInt32BE(index.length, 4);
  return Buffer.concat([head, index, ...names.map((n) => files[n])]);
}

export function unpackFiles(buf: Buffer): Record<string, Buffer> | null {
  try {
    if (buf.length < 8 || buf.toString("ascii", 0, 4) !== "WPS1") return null;
    const len = buf.readUInt32BE(4);
    const index = JSON.parse(buf.toString("utf8", 8, 8 + len)) as { n: string; s: number }[];
    const out: Record<string, Buffer> = {};
    let at = 8 + len;
    for (const { n, s } of index) {
      if (at + s > buf.length) return null;
      out[n] = buf.subarray(at, at + s);
      at += s;
    }
    return at === buf.length ? out : null;
  } catch {
    return null;
  }
}
