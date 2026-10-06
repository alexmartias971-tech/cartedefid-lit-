import type { CardDesign } from "@/lib/card-state";
import type { RewardMode } from "@/lib/types";

export type TierRow = {
  key: string;
  id?: string;
  name: string;
  min_value: string;
  perk: string;
  color: string;
  image?: string | null;
  removeImage?: boolean;
};

export type Values = {
  name: string;
  program_name: string;
  mode: RewardMode;
  reward_description: string;
  reward_threshold: number;
  points_per_euro: number;
  cashback_percent: number;
  background_color: string;
  foreground_color: string;
  label_color: string;
  stamp_color: string;
  strip_overlay: number;
  tiers_enabled: boolean;
  tier_basis: "visits" | "spend";
  decor_preset: string;
  photo_focus: CardDesign["photoFocus"];
  progress_style: CardDesign["progressStyle"];
  stamps_position: CardDesign["stampsPosition"];
  icon_preset: string;
  vessel: CardDesign["vessel"];
  fill_color: string;
  reward_on_last: boolean;
  show_logo_text: boolean;
  label_balance: string;
  label_customer: string;
  label_reward: string;
  signup_bonus: number;
  bonus_multiplier: number;
  bonus_start_hour: number;
  bonus_end_hour: number;
  referral_bonus: number;
  streak_enabled: boolean;
  streak_goal: number;
  streak_bonus: number;
  streak_reminder_dow: number;
  streak_reminder_hour: number;
  lap_times_enabled: boolean;
};

let keySeq = 0;
export const newKey = () => `k${Date.now().toString(36)}${++keySeq}`;
