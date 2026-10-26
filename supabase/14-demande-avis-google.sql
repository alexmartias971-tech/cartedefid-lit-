-- 14 — Demande d'avis Google automatique (formule Tout compris), UNE SEULE FOIS par carte.
-- À APPLIQUER (pas encore en production). Une table NOUVELLE uniquement : aucune table existante du logiciel
-- de cartes n'est modifiée. Logique : src/lib/review-requests-core.ts (tâche /api/cron/notifications, 5 minutes).
--
-- Une ligne par carte demandée :
--   1) la tâche RÉSERVE la carte : ligne « pending » (clé primaire card_id : deux tâches en même temps ne peuvent
--      pas envoyer deux fois) ;
--   2) elle écrit le message sur la carte et notifie (iPhone + Google) ;
--   3) la ligne passe à « sent » (sent_at = heure de l'envoi), ou « failed » si aucun téléphone n'a été joint
--      (nouvel essai 30 minutes plus tard, 3 essais au plus).
-- Une ligne restée « pending » (coupure entre l'envoi et l'écriture) n'est jamais renvoyée : au pire une demande
-- perdue, jamais deux. Table fermée (RLS sans règle) : seul le serveur (service_role) la lit / l'écrit.
-- Sans cette table, la tâche s'arrête avant tout envoi (lecture impossible) : le code peut être déployé avant.

create table if not exists public.review_requests (
  card_id uuid primary key references public.cards(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts between 1 and 10),
  error text check (error is null or char_length(error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists review_requests_business_sent on public.review_requests (business_id, sent_at desc);

alter table public.review_requests enable row level security;
revoke all on table public.review_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.review_requests to service_role;
comment on table public.review_requests is
  'Demande d''avis Google automatique : une ligne par carte (pending = réservée, sent = envoyée, failed = aucun téléphone joint).';
