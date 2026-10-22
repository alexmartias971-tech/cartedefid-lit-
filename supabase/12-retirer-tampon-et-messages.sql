-- Déjà appliqué dans Supabase le 20 octobre 2026 (migrations espace_retirer_tampon_messages et
-- espace_program_stamps_par_commerce). Ce fichier garde la version finale, pour mémoire : rien à faire.

-- Espace commerçant de walty.fr (retours du test d'Alexandre, 20 oct. 2026) :
--   1) « Retirer un tampon » (gérant seulement) : à tout moment, avec une raison obligatoire, jamais en dessous de 0.
--      - stamp_events : nouveau type d'événement « stamp_removed » (delta -1, raison dans note).
--        SEULE modification d'une table de cartes : la contrainte event_type, recréée avec TOUTES les valeurs d'avant + la nouvelle.
--      - merchant_manual_actions (migration 016) : nouvelle action « remove_stamp » (qui, quand, raison).
--      - merchant_remove_stamp(p_card, p_scanner, p_reason) : vérifie l'accès gérant, la carte du MÊME commerce,
--        le mode tampons, la limite de 30 actions à la main par commerce et par jour, puis retire 1 tampon du compteur
--        en cours (un cadeau déjà remis n'est pas touché ; si le cadeau était prêt, il ne l'est plus).
--   2) Messages au-delà de la limite de la semaine (gérant, avec avertissement) : table merchant_notification_overrides
--      (journal + limite de 3 envois « au-delà » par semaine, contrôlée par le logiciel de cartes).
--   3) « Mon programme » : merchant_program_stamps(p_business) = nombre de cartes et répartition des tampons,
--      pour prévenir AVANT d'enregistrer un nouveau nombre de tampons.
-- Toutes les fonctions : security definer, search_path vide, EXECUTE pour service_role seulement.

-- ------------------------------------------------------------------ 1. type d'événement « stamp_removed »
alter table public.stamp_events drop constraint if exists stamp_events_event_type_check;
alter table public.stamp_events add constraint stamp_events_event_type_check
  check (event_type = any (array['stamp'::text, 'reward_redeemed'::text, 'correction'::text, 'purchase'::text,
                                 'points_redeemed'::text, 'cashback_used'::text, 'coupon_used'::text, 'stamp_removed'::text]));

alter table public.merchant_manual_actions drop constraint if exists merchant_manual_actions_action_check;
alter table public.merchant_manual_actions add constraint merchant_manual_actions_action_check
  check (action = any (array['stamp'::text, 'redeem'::text, 'purchase'::text, 'cashback'::text, 'reward'::text, 'coupon'::text,
                             'remove_stamp'::text]));

-- ------------------------------------------------------------------ retirer 1 tampon (gérant)
create or replace function public.merchant_remove_stamp(p_card uuid, p_scanner uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily_max constant integer := 30;
  v_access public.scanner_access;
  v_biz_status text;
  v_card public.cards;
  v_prog public.loyalty_programs;
  v_reason text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'America/Guadeloupe')) at time zone 'America/Guadeloupe';
  v_used integer;
  v_was_ready boolean;
  v_event uuid;
begin
  if v_reason is null or char_length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'error', 'Indiquez la raison (3 caractères au moins).');
  end if;
  v_reason := left(v_reason, 200);

  select * into v_access from public.scanner_access where id = p_scanner and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'Accès commerçant désactivé.'); end if;
  select status into v_biz_status from public.businesses where id = v_access.business_id;
  if v_biz_status is distinct from 'active' then return jsonb_build_object('ok', false, 'error', 'Ce compte est suspendu.'); end if;
  if not exists (select 1 from public.merchant_logins m where m.scanner_access_id = p_scanner and not m.must_change_password) then
    return jsonb_build_object('ok', false, 'forbidden', true, 'error', 'Réservé au gérant (connexion par e-mail et mot de passe).');
  end if;

  -- même verrou que les actions à la main (toujours AVANT le verrou de la carte : pas d'interblocage)
  perform pg_advisory_xact_lock(hashtext('walty-manual:' || v_access.business_id::text));

  select c.* into v_card
    from public.cards c
    join public.loyalty_programs p on p.id = c.program_id
   where c.id = p_card and p.business_id = v_access.business_id
   for update of c;
  if not found then return jsonb_build_object('ok', false, 'error', 'Client introuvable.'); end if;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if v_prog.mode <> 'stamps' then
    return jsonb_build_object('ok', false, 'error', 'Cette carte ne fonctionne pas avec des tampons.');
  end if;

  select count(*) into v_used from public.merchant_manual_actions
   where business_id = v_access.business_id and created_at >= v_day_start;
  if v_used >= c_daily_max then
    return jsonb_build_object('ok', false, 'rate_limited', true,
      'error', 'Limite atteinte : ' || c_daily_max || ' actions à la main par jour. Appelez Walty si besoin.');
  end if;

  if v_card.stamps_count <= 0 then
    return jsonb_build_object('ok', false, 'empty', true, 'error', 'Ce client n''a aucun tampon à retirer.');
  end if;

  v_was_ready := v_card.stamps_count >= v_prog.reward_threshold;
  update public.cards
     set rewards_earned = greatest(0, rewards_earned - case when stamps_count >= v_prog.reward_threshold
                                                             and stamps_count - 1 < v_prog.reward_threshold then 1 else 0 end),
         stamps_count = stamps_count - 1
   where id = v_card.id
  returning * into v_card;

  insert into public.stamp_events (card_id, business_id, scanner_id, event_type, delta, note)
  values (v_card.id, v_prog.business_id, p_scanner, 'stamp_removed', -1, v_reason)
  returning id into v_event;

  insert into public.merchant_manual_actions (business_id, scanner_id, scanner_label, card_id, stamp_event_id, action, over_limit, reason)
  values (v_access.business_id, p_scanner, coalesce(v_access.label, ''), v_card.id, v_event, 'remove_stamp', false, v_reason);

  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'stamps', v_card.stamps_count,
    'threshold', v_prog.reward_threshold, 'was_ready', v_was_ready,
    'reward_ready', v_card.stamps_count >= v_prog.reward_threshold,
    'event_id', v_event, 'manual_left', c_daily_max - v_used - 1);
end;
$$;

revoke all on function public.merchant_remove_stamp(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.merchant_remove_stamp(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------------ 2. messages au-delà de la limite de la semaine
create table if not exists public.merchant_notification_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  scanner_id uuid references public.scanner_access(id) on delete set null,
  scanner_label text not null default '',
  notification_id uuid references public.notifications(id) on delete set null,
  -- lundi 00:00 (heure de Guadeloupe) de la semaine d'envoi : la limite de 3 envois « au-delà » se compte par semaine
  week_start timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists merchant_notification_overrides_week on public.merchant_notification_overrides (business_id, week_start);
create index if not exists merchant_notification_overrides_notif on public.merchant_notification_overrides (notification_id);

alter table public.merchant_notification_overrides enable row level security;
revoke all on table public.merchant_notification_overrides from anon, authenticated, public;
grant all on table public.merchant_notification_overrides to service_role;

-- ------------------------------------------------------------------ 3. répartition des tampons d'un commerce
drop function if exists public.merchant_program_stamps(uuid);

create or replace function public.merchant_program_stamps(p_business uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select cards.stamps_count, cards.wallet_platform
      from public.cards
      join public.loyalty_programs p on p.id = cards.program_id
     where p.business_id = p_business
  )
  select jsonb_build_object(
    'cards', (select count(*) from c),
    'installed', (select count(*) from c where wallet_platform in ('apple', 'google')),
    'by_stamps', coalesce((
      select jsonb_object_agg(s::text, n)
        from (select stamps_count as s, count(*) as n from c group by stamps_count) x
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.merchant_program_stamps(uuid) from public, anon, authenticated;
grant execute on function public.merchant_program_stamps(uuid) to service_role;
