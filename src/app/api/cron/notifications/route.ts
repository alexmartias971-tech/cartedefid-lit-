import { NextResponse } from "next/server";
import { runDueNotifications, runWinback } from "@/lib/notifications";

export const maxDuration = 300;

/**
 * Tâche planifiée (toutes les 5 minutes, voir vercel.json) :
 * envoie les notifications programmées et les messages "Tu nous manques".
 * Protégée par CRON_SECRET : Vercel l'envoie automatiquement dans l'en-tête Authorization.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorisé", { status: 401 });
  }
  const sent = await runDueNotifications();
  const winback = await runWinback();
  return NextResponse.json({ ok: true, notifications: sent, winback });
}
