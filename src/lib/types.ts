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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
};

/** Une carte avec tout ce qu'il faut pour l'afficher : client, programme, entreprise. */
export type CardBundle = {
  card: Card;
  customer: Customer;
  program: Program;
  business: Business;
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
