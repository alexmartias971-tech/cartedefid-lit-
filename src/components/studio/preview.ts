"use client";

import { useMemo } from "react";
import { computeCardState, currentWeekStart, resolveSlots, stripProgress, type CardDesign } from "@/lib/card-state";
import type { ArtFormat } from "@/lib/layout";
import type { CatalogReward, Tier } from "@/lib/types";
import type { Draft, Images } from "./state";

/** Le moment de la vie de la carte montré dans l'aperçu. */
export type Moment = "start" | "half" | "gift";
export const MOMENTS: { id: Moment; label: string }[] = [
  { id: "start", label: "Carte neuve" },
  { id: "half", label: "À mi-chemin" },
  { id: "gift", label: "Cadeau gagné" },
];

export const SAMPLE_NAME = "Marie";

/** Tout ce qu'il faut pour dessiner l'aperçu de la carte à partir des réglages en cours. */
export function usePreview(d: Draft, images: Images, moment: Moment, forcedTier: string) {
  return useMemo(() => {
    const tiers: Tier[] = d.tiers
      .filter((t) => t.name.trim())
      .map((t, i) => ({
        id: t.key,
        program_id: "",
        name: t.name,
        min_value: Number(t.min_value) || 0,
        perk: t.perk || null,
        color: t.color || null,
        image_url: t.image.preview,
        sort: i,
      }))
      .sort((a, b) => a.min_value - b.min_value);
    const catalog: CatalogReward[] = d.catalog
      .filter((r) => r.name.trim() && Number(r.cost) > 0)
      .map((r, i) => ({ id: r.key, program_id: "", name: r.name, cost: Number(r.cost), is_active: true, sort: i }))
      .sort((a, b) => a.cost - b.cost);
    const firstCost = catalog[0]?.cost ?? 100;
    const threshold = d.reward_threshold;
    const start = Math.min(d.signup_bonus, threshold - 1);
    const stamps = moment === "start" ? start : moment === "half" ? Math.max(start + 1, Math.ceil(threshold / 2)) : threshold;
    const sample = {
      stamps_count: stamps,
      points_balance: moment === "start" ? (d.mode === "points" ? d.signup_bonus : 0) : moment === "half" ? Math.round(firstCost * 0.55) : firstCost + 12,
      cashback_balance: moment === "start" ? 0 : moment === "half" ? 4.5 : 12,
      lifetime_visits: moment === "start" ? 0 : moment === "half" ? 6 : 14,
      lifetime_spent: moment === "start" ? 0 : moment === "half" ? 90 : 210,
      tier_id: null as string | null,
      streak_count: moment === "start" ? 0 : 3,
      streak_best: 5,
      streak_week: currentWeekStart(),
      best_lap_ms: moment === "start" ? null : 38412,
      lap_rank: moment === "start" ? null : 7,
      lap_rank_total: 48,
    };
    const metric = d.tier_basis === "spend" ? sample.lifetime_spent : sample.lifetime_visits;
    const forced = tiers.find((t) => t.id === forcedTier);
    sample.tier_id = forced ? forced.id : ([...tiers].reverse().find((t) => t.min_value <= metric)?.id ?? null);
    const state = computeCardState(
      {
        mode: d.mode,
        reward_threshold: threshold,
        reward_description: d.reward_description.trim() || "ton cadeau",
        points_per_euro: d.points_per_euro || 1,
        cashback_percent: d.cashback_percent || 5,
        tiers_enabled: d.tiers_enabled,
        tier_basis: d.tier_basis,
        streak_enabled: d.streak_enabled,
        streak_goal: d.streak_goal,
        lap_times_enabled: d.lap_times_enabled,
        progress_style: d.progress_style,
      },
      sample,
      tiers,
      catalog,
    );
    const progress = stripProgress(d.mode, state, sample, catalog);
    const design: CardDesign = {
      mode: d.mode,
      programName: d.program_name,
      backgroundColor: d.background_color,
      foregroundColor: d.foreground_color,
      labelColor: d.label_color,
      stampColor: d.stamp_color,
      stripOverlay: d.strip_overlay,
      stripImageUrl: images.strip.preview,
      stampIconUrl: d.legacy.stamp_icon_url,
      stampEmptyIconUrl: d.legacy.stamp_empty_icon_url,
      decorPreset: d.legacy.decor_preset,
      photoFocus: d.photo_focus,
      progressStyle: d.progress_style,
      stampsPosition: d.legacy.stamps_position as CardDesign["stampsPosition"],
      iconPreset: d.icon_preset,
      collectionIcons: d.collection,
      vessel: d.legacy.vessel as CardDesign["vessel"],
      fillColor: d.legacy.fill_color,
      rewardOnLast: d.reward_on_last,
      showLogoText: d.show_logo_text,
      labelBalance: d.legacy.label_balance || null,
      labelCustomer: d.legacy.label_customer || null,
      labelReward: d.legacy.label_reward || null,
      layout: d.layout,
    };
    const nextReward = catalog.find((r) => r.cost > sample.points_balance) ?? null;
    const slots = resolveSlots(design, state, {
      customerName: SAMPLE_NAME,
      mode: d.mode,
      rewardDescription: d.reward_description.trim() || "Ton cadeau",
      cashbackPercent: d.cashback_percent,
      nextReward: nextReward ? { cost: nextReward.cost, name: nextReward.name } : null,
      coupons: moment === "start" && d.welcome_offer.trim() ? 1 : 0,
    });
    const tierPhoto = state.tier?.image_url || null;
    // Une photo de niveau n'a pas été recadrée : le cadrage de la photo principale ne s'y applique pas
    if (tierPhoto) design.layout = { ...design.layout, crop: undefined };
    const photoFor = (f: ArtFormat) => tierPhoto || images.bg[f]?.preview || images.strip.preview;
    const coupons = moment === "start" && d.welcome_offer.trim() ? 1 : 0;
    return { design, state, progress, slots, photoFor, tiers, coupons };
  }, [d, images, moment, forcedTier]);
}
