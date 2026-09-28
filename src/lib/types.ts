export type Business = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: "active" | "suspended";
  max_notifications_per_week: number;
  latitude: number | null;
  longitude: number | null;
  relevant_text: string | null;
  google_review_url: string | null;
  instagram_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Program = {
  id: string;
  business_id: string;
  name: string;
  reward_threshold: number;
  reward_description: string;
  background_color: string;
  foreground_color: string;
  label_color: string;
  back_text: string | null;
  max_stamps_per_day: number;
  is_active: boolean;
  mode: RewardMode;
  points_per_euro: number;
  cashback_percent: number;
  strip_image_url: string | null;
  stamp_icon_url: string | null;
  stamp_empty_icon_url: string | null;
  stamp_color: string;
  strip_overlay: number;
  tiers_enabled: boolean;
  tier_basis: "visits" | "spend";
  welcome_offer: string | null;
  birthday_offer: string | null;
  max_purchase_amount: number;
  decor_preset: string;
  progress_style: "glass" | "minimal" | "grid" | "collection" | "fill" | "none";
  photo_focus: "top" | "center" | "bottom";
  stamps_position: "center" | "right" | "bottom";
  icon_preset: string;
  collection_icons: string[];
  vessel: "glass" | "cup";
  fill_color: string;
  reward_on_last: boolean;
  show_logo_text: boolean;
  label_balance: string | null;
  label_customer: string | null;
  label_reward: string | null;
  signup_bonus: number;
  bonus_multiplier: number;
  bonus_start_hour: number | null;
  bonus_end_hour: number | null;
  referral_bonus: number;
  created_at: string;
  updated_at: string;
};

/** Les 3 façons de gagner : tampons, points (par €), cashback (% en €). */
export type RewardMode = "stamps" | "points" | "cashback";

export type Tier = {
  id: string;
  program_id: string;
  name: string;
  min_value: number;
  perk: string | null;
  color: string | null;
  /** Photo de la carte à ce niveau (sinon la photo principale). */
  image_url: string | null;
  sort: number;
};

export type CatalogReward = {
  id: string;
  program_id: string;
  name: string;
  cost: number;
  is_active: boolean;
  sort: number;
};

export type Coupon = {
  id: string;
  card_id: string;
  program_id: string;
  title: string;
  kind: "welcome" | "birthday" | "manual";
  status: "active" | "used" | "expired";
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
};

export type Customer = {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  marketing_optin: boolean;
  created_at: string;
  last_visit_at: string | null;
};

export type Card = {
  id: string;
  customer_id: string;
  program_id: string;
  serial_number: string;
  auth_token: string;
  web_token: string;
  stamps_count: number;
  rewards_earned: number;
  rewards_redeemed: number;
  last_message: string | null;
  wallet_platform: "apple" | "google" | "web" | null;
  google_saved: boolean;
  winback_sent_at: string | null;
  points_balance: number;
  cashback_balance: number;
  lifetime_visits: number;
  lifetime_spent: number;
  lifetime_points: number;
  tier_id: string | null;
  referral_code: string;
  referred_by_card_id: string | null;
  referral_rewarded: boolean;
  created_at: string;
  updated_at: string;
};

/** Une carte avec tout ce qu'il faut pour l'afficher : client, programme, entreprise. */
export type CardBundle = {
  card: Card;
  customer: Customer;
  program: Program;
  business: Business;
  /** Niveaux du programme (triés du plus bas au plus haut). */
  tiers: Tier[];
  /** Cadeaux du catalogue (mode points). */
  catalog: CatalogReward[];
  /** Offres encore utilisables par ce client. */
  coupons: Coupon[];
};

export type NotificationRow = {
  id: string;
  business_id: string;
  message: string;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed" | "skipped";
  send_at: string;
  repeat_every_days: number | null;
  repeat_until: string | null;
  created_by: "admin" | "merchant";
  sent_at: string | null;
  recipients_count: number | null;
  error: string | null;
  created_at: string;
};
