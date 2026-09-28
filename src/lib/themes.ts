/** Ambiances prêtes à l'emploi : un clic applique couleurs + décor + icône. Tout reste modifiable ensuite. */
export type Theme = {
  id: string;
  label: string;
  background_color: string;
  foreground_color: string;
  label_color: string;
  stamp_color: string;
  decor_preset: string;
  icon_preset: string;
  fill_color: string;
};

export const THEMES: Theme[] = [
  { id: "plage", label: "Plage turquoise", background_color: "#0E7C86", foreground_color: "#FFFFFF", label_color: "#CFF3F0", stamp_color: "#FFD166", decor_preset: "beach", icon_preset: "coffee", fill_color: "#8FD16A" },
  { id: "sunset", label: "Coucher de soleil", background_color: "#3B1F4A", foreground_color: "#FFF4E6", label_color: "#FFC7A8", stamp_color: "#FF8A5B", decor_preset: "sunset", icon_preset: "sun", fill_color: "#FF8A5B" },
  { id: "matcha", label: "Matcha zen", background_color: "#E9F1E4", foreground_color: "#24452B", label_color: "#5E7F54", stamp_color: "#6DA34D", decor_preset: "matcha", icon_preset: "matcha", fill_color: "#8FD16A" },
  { id: "cafe", label: "Café noir", background_color: "#2B1D16", foreground_color: "#F6EBDD", label_color: "#D4B08C", stamp_color: "#C8894E", decor_preset: "coffee", icon_preset: "coffee", fill_color: "#C8894E" },
  { id: "jungle", label: "Jungle tropicale", background_color: "#0F3D2E", foreground_color: "#FFFFFF", label_color: "#BDE6C8", stamp_color: "#FF5E7E", decor_preset: "tropical", icon_preset: "hibiscus", fill_color: "#FF5E7E" },
  { id: "lagon", label: "Lagon", background_color: "#0B6474", foreground_color: "#FFFFFF", label_color: "#CDE7EA", stamp_color: "#FFFFFF", decor_preset: "lagoon", icon_preset: "shell", fill_color: "#7FD6E0" },
  { id: "chic", label: "Minimal chic", background_color: "#111111", foreground_color: "#FFFFFF", label_color: "#BBBBBB", stamp_color: "#E8C872", decor_preset: "lines", icon_preset: "star", fill_color: "#E8C872" },
  { id: "pop", label: "Confettis pop", background_color: "#FFF6EC", foreground_color: "#1F2937", label_color: "#E0474F", stamp_color: "#F2545B", decor_preset: "terrazzo", icon_preset: "heart", fill_color: "#F2545B" },
];
