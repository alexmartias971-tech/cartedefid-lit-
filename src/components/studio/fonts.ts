import { Manrope, Unbounded } from "next/font/google";

/* Polices de la marque Walty : Unbounded pour les titres, Manrope pour expliquer (licence OFL). */
export const unbounded = Unbounded({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-unbounded", display: "swap" });
export const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
