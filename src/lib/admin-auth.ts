import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Vérifie que la personne connectée est bien un admin (présent dans la table "admins").
 * À appeler au début de CHAQUE page et action du tableau de bord.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) redirect("/login?erreur=non-admin");

  return { supabase, user };
}
