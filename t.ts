import sharp from "sharp";
import { buildStripSvg, type StripOptions } from "@/lib/art";
const S = "/tmp/claude-0/-home-claude/8d579a0f-2d5b-5ed8-9dfd-8a44a8cef288/scratchpad";
const base: StripOptions = { background: "#0b4f5c", accent: "#FFFFFF", foreground: "#FFFFFF", decorPreset: "beach", overlay: 0,
  style: "collection", position: "bottom", total: 8, filled: 3, iconPreset: "coffee", collection: ["coffee","matcha","iced","icecream"],
  vessel: "glass", fillColor: "#8fd16a", rewardOnLast: true };
const variants: [string, Partial<StripOptions>][] = [
  ["a-beach-collection-bottom", {}],
  ["b-beach-grid-right", { style: "grid", position: "right", iconPreset: "iced", total: 10, filled: 4 }],
  ["c-sunset-fill", { decorPreset: "sunset", style: "fill", total: 8, filled: 5, fillColor: "#f7a94b" }],
  ["d-lagoon-center", { decorPreset: "lagoon", style: "grid", position: "center", accent: "#ffd166", iconPreset: "shell", total: 10, filled: 6 }],
  ["e-tropical-cup", { decorPreset: "tropical", style: "fill", vessel: "cup", fillColor: "#7fbf5a", accent: "#f4c95d" }],
  ["f-coffee", { decorPreset: "coffee", background: "#3b1f0e", style: "grid", position: "center", iconPreset: "coffee", accent: "#fff3e0", total: 12, filled: 7 }],
  ["g-matcha", { decorPreset: "matcha", background: "#2f5d1e", style: "grid", position: "right", iconPreset: "matcha", accent: "#2f5d1e", total: 6, filled: 2 }],
  ["h-terrazzo", { decorPreset: "terrazzo", background: "#1d2a5c", accent: "#ff8fab", foreground: "#fff", style: "grid", position: "center", iconPreset: "hibiscus", total: 8, filled: 3 }],
];
(async () => {
  const bufs: Buffer[] = [];
  for (const [n, v] of variants) {
    const svg = buildStripSvg({ ...base, ...v }, 750, 246, n);
    bufs.push(await sharp(Buffer.from(svg)).png().toBuffer());
  }
  // planche contact
  const sheet = sharp({ create: { width: 1520, height: 4 * 256, channels: 3, background: "#ffffff" } })
    .composite(bufs.map((b, i) => ({ input: b, left: (i % 2) * 765, top: Math.floor(i / 2) * 256 })));
  await sheet.png().toFile(`${S}/sheet.png`);
  console.log("ok");
})();
