import { NextResponse } from "next/server";
import { runBirthdays, runDueNotifications, runStreakReminders, runWinback } from "@/lib/notifications";

export const maxDuration = 300;

/**
 * Tâche planifiée (toutes les 5 minutes via supabase/03-envoi-automatique.sql, + 1 fois par jour via vercel.json) :
 * envoie les notifications programmées, les messages "Tu nous manques" et les offres d'anniversaire.
 * Protégée par CRON_SECRET : Vercel l'envoie automatiquement dans l'en-tête Authorization.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorisé", { status: 401 });
  }
  const sent = await runDueNotifications();
  const winback = await runWinback();
  const birthdays = await runBirthdays();
  const streaks = await runStreakReminders();
  return NextResponse.json({ ok: true, notifications: sent, winback, birthdays, streaks });
}
