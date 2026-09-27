-- =====================================================================
-- ENVOI AUTOMATIQUE DES NOTIFICATIONS PROGRAMMÉES (toutes les 5 minutes)
-- Gratuit : c'est Supabase qui appelle ton site toutes les 5 minutes.
-- À lancer UNE FOIS, APRÈS la mise en ligne sur Vercel.
--
-- Avant de cliquer sur Run, remplace les 2 valeurs entre < > :
--   <ADRESSE-DU-SITE>  → l'adresse de ton site, sans "/" à la fin
--                        (ex : https://carte-fidelite.vercel.app)
--   <CRON_SECRET>      → la même valeur que la variable CRON_SECRET mise dans Vercel
-- Garde les apostrophes ' autour.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'notifications-toutes-les-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := '<ADRESSE-DU-SITE>/api/cron/notifications',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 60000
  );
  $$
);

-- Pour vérifier que ça tourne (plus tard) :
--   select * from cron.job_run_details order by start_time desc limit 5;
-- Pour arrêter l'envoi automatique :
--   select cron.unschedule('notifications-toutes-les-5-minutes');
