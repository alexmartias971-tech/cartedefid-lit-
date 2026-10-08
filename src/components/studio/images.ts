"use client";

export { useImageRatio } from "@/lib/use-image-ratio";
import { uploadCardImage } from "@/app/admin/actions";

const MAX_BYTES = 2.5 * 1024 * 1024;

/**
 * Prépare une image avant l'envoi : plus grand côté limité, photos en JPEG, logos en PNG (transparence gardée),
 * qualité baissée si besoin pour rester sous 2,5 Mo (le serveur refuse au-delà de 3 Mo).
 */
export async function shrink(file: File, maxSide = 2000, keepAlpha = false): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900 * 1024 && ["image/png", "image/jpeg", "image/webp"].includes(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Une illustration détourée (PNG transparent) reste transparente : en JPEG, le transparent deviendrait noir
    const alpha = keepAlpha || (file.type !== "image/jpeg" && hasTransparency(ctx, canvas.width, canvas.height));
    const type = alpha ? "image/png" : "image/jpeg";
    let quality = 0.88;
    let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
    while (blob && blob.size > MAX_BYTES && type === "image/jpeg" && quality > 0.5) {
      quality -= 0.1;
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
    }
    if (blob && blob.size > MAX_BYTES && alpha) blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.9));
    if (!blob) return file;
    const ext = blob.type === "image/png" ? ".png" : blob.type === "image/webp" ? ".webp" : ".jpg";
    return new File([blob], file.name.replace(/\.\w+$/, "") + ext, { type: blob.type });
  } catch {
    return file;
  }
}

/** L'image a-t-elle des zones transparentes ? (vérifié sur une image réduite, c'est assez précis et rapide) */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const step = Math.max(1, Math.floor(Math.max(w, h) / 300));
  const px = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (px[(y * w + x) * 4 + 3] < 250) return true;
  return false;
}

/** Envoie une image dans le stockage Walty et renvoie son adresse publique. */
export async function upload(file: File, kind: "logo" | "strip" | "bg" | "tier", businessId?: string): Promise<{ url?: string; error?: string }> {
  if (!/^image\/(png|jpeg|webp|gif|heic|heif|avif)$/i.test(file.type)) return { error: "Choisissez une image (PNG, JPG ou WEBP)." };
  const ready = await shrink(file, kind === "logo" ? 1200 : 2000, kind === "logo");
  if (ready.size > 3 * 1024 * 1024) return { error: "Image trop lourde, même allégée : essayez une autre image (moins de 3 Mo)." };
  const fd = new FormData();
  fd.append("file", ready);
  fd.append("kind", kind);
  fd.append("business_id", businessId ?? "");
  try {
    return await uploadCardImage(fd);
  } catch {
    return { error: "Envoi impossible pour le moment : vérifiez votre connexion et réessayez." };
  }
}

export const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * Logo en JPG (ou PNG sans transparence) sur fond blanc : on retire ce fond blanc,
 * en partant des bords (les blancs à l'intérieur du logo sont gardés).
 */
export async function removeWhiteBackground(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const at = (x: number, y: number) => (y * w + x) * 4;
    const whiteish = (i: number) => px[i + 3] > 250 && px[i] > 232 && px[i + 1] > 232 && px[i + 2] > 232;
    // Déjà transparent, ou coins pas blancs : on ne touche à rien
    const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
    if (!corners.every(whiteish)) return null;
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
    for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
    let removed = 0;
    while (stack.length) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      const k = y * w + x;
      if (seen[k]) continue;
      seen[k] = 1;
      const i = k * 4;
      if (!whiteish(i)) continue;
      px[i + 3] = 0;
      removed++;
      if (x > 0) stack.push(x - 1, y);
      if (x < w - 1) stack.push(x + 1, y);
      if (y > 0) stack.push(x, y - 1);
      if (y < h - 1) stack.push(x, y + 1);
    }
    if (removed < w * h * 0.08) return null; // presque pas de fond : on garde l'original
    ctx.putImageData(img, 0, 0);
    // On recadre au plus près du logo (sans les marges devenues transparentes)
    let [x0, y0, x1, y1] = [w, h, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 > x0 && y1 > y0 && (x1 - x0 < w - 4 || y1 - y0 < h - 4)) {
      const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
      const cx = Math.max(0, x0 - pad);
      const cy = Math.max(0, y0 - pad);
      const cw = Math.min(w, x1 + pad + 1) - cx;
      const ch = Math.min(h, y1 + pad + 1) - cy;
      const crop = document.createElement("canvas");
      crop.width = cw;
      crop.height = ch;
      crop.getContext("2d")!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
      const cropped = await new Promise<Blob | null>((r) => crop.toBlob(r, "image/png"));
      if (cropped) return new File([cropped], file.name.replace(/\.\w+$/, "") + ".png", { type: "image/png" });
    }
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".png", { type: "image/png" }) : null;
  } catch {
    return null;
  }
}

/**
 * Logo déjà transparent (PNG) : on retire les marges vides autour, comme le fait le serveur,
 * pour que l'aperçu et la vraie carte partent exactement de la même image. null = rien à retirer.
 */
export async function trimTransparent(file: File): Promise<File | null> {
  if (file.type === "image/jpeg") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const a = (x: number, y: number) => px[(y * w + x) * 4 + 3];
    if (a(0, 0) > 16 || a(w - 1, 0) > 16 || a(0, h - 1) > 16 || a(w - 1, h - 1) > 16) return null; // logo sur fond de couleur
    let [x0, y0, x1, y1] = [w, h, -1, -1];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a(x, y) > 8) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
    const cx = Math.max(0, x0 - pad);
    const cy = Math.max(0, y0 - pad);
    const cw = Math.min(w, x1 + pad + 1) - cx;
    const ch = Math.min(h, y1 + pad + 1) - cy;
    if (cw >= w - 4 && ch >= h - 4) return null;
    const crop = document.createElement("canvas");
    crop.width = cw;
    crop.height = ch;
    crop.getContext("2d")!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    const blob = await new Promise<Blob | null>((r) => crop.toBlob(r, "image/png"));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".png", { type: "image/png" }) : null;
  } catch {
    return null;
  }
}

/** Les couleurs principales d'une image (logo ou photo), de la plus présente à la moins présente. */
export async function dominantColors(url: string, max = 3): Promise<string[]> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const n = 48;
    const canvas = document.createElement("canvas");
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, n, n);
    const px = ctx.getImageData(0, 0, n, n).data;
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 200) continue;
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      if (mx > 240 && mn > 225) continue; // blanc
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      cur.n++;
      cur.r += r;
      cur.g += g;
      cur.b += b;
      buckets.set(key, cur);
    }
    const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
    const list = [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .map((c) => ({ r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }));
    const out: { r: number; g: number; b: number }[] = [];
    for (const c of list) {
      if (out.every((o) => Math.abs(o.r - c.r) + Math.abs(o.g - c.g) + Math.abs(o.b - c.b) > 90)) out.push(c);
      if (out.length >= max) break;
    }
    return out.map((c) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`.toUpperCase());
  } catch {
    return [];
  }
}
