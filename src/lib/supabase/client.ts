import { createBrowserClient } from "@supabase/ssr";

/** Connexion à Supabase depuis le navigateur (page de connexion admin). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
