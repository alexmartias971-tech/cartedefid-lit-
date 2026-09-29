-- 08 : « Série de la semaine » (revenir chaque semaine) + record personnel (chrono)
-- et nouveau style de progression « piste » (course).

-- ---------- Réglages du programme ----------
alter table public.loyalty_programs
  add column if not exists streak_enabled boolean not null default false,
  add column if not exists streak_goal integer not null default 4,          -- semaines d'affilée pour le bonus
  add column if not exists streak_bonus integer not null default 1,         -- tampons / points offerts à chaque palier
  add column if not exists streak_reminder_dow integer not null default 0,  -- jour du rappel (0 = dimanche … 6 = samedi)
  add column if not exists streak_reminder_hour integer not null default 11,-- heure du rappel (Guadeloupe)
  add column if not exists lap_times_enabled boolean not null default false;

alter table public.loyalty_programs drop constraint if exists loyalty_programs_streak_check;
alter table public.loyalty_programs add constraint loyalty_programs_streak_check check (
  streak_goal between 2 and 52 and streak_bonus between 0 and 1000
  and streak_reminder_dow between 0 and 6 and streak_reminder_hour between 0 and 23
);

-- Nouveau style « piste » (le kart avance sur un circuit)
alter table public.loyalty_programs drop constraint if exists loyalty_programs_design_check;
alter table public.loyalty_programs add constraint loyalty_programs_design_check check (
  progress_style in ('glass', 'minimal', 'track', 'grid', 'collection', 'fill', 'none')
  and stamps_position in ('center', 'right', 'bottom')
  and photo_focus in ('top', 'center', 'bottom')
  and vessel in ('glass', 'cup')
  and signup_bonus between 0 and 1000
  and bonus_multiplier between 1 and 3
  and (bonus_start_hour is null or bonus_start_hour between 0 and 23)
  and (bonus_end_hour is null or bonus_end_hour between 1 and 24)
  and referral_bonus between 0 and 1000
);

-- ---------- État de chaque carte ----------
alter table public.cards
  add column if not exists streak_count integer not null default 0,   -- semaines d'affilée en cours
  add column if not exists streak_best integer not null default 0,    -- meilleure série
  add column if not exists streak_week date,                          -- lundi de la dernière semaine comptée
  add column if not exists streak_reminded_week date,                 -- semaine du dernier rappel envoyé
  add column if not exists best_lap_ms integer,                       -- meilleur tour en millisecondes
  add column if not exists best_lap_at timestamptz;

-- ---------- Série : mise à jour automatique à chaque passage ----------
-- Une « semaine » va du lundi au dimanche (heure de Guadeloupe).
-- Venir au moins une fois dans la semaine prolonge la série ; sauter une semaine la remet à 1.
-- À chaque palier (ex : 4, 8, 12 semaines), le client reçoit un bonus.
create or replace function public._streak_on_visit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_card public.cards;
  v_prog public.loyalty_programs;
  v_week date;
  v_count integer;
  v_bonus integer := 0;
begin
  if new.event_type not in ('stamp', 'purchase') then return new; end if;
  select * into v_card from public.cards where id = new.card_id;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if not found or not v_prog.streak_enabled then return new; end if;

  v_week := date_trunc('week', (now() at time zone 'America/Guadeloupe'))::date;
  if v_card.streak_week = v_week then return new; end if;  -- déjà compté cette semaine
  v_count := case when v_card.streak_week = v_week - 7 then v_card.streak_count + 1 else 1 end;
  if v_count % v_prog.streak_goal = 0 then v_bonus := v_prog.streak_bonus; end if;

  update public.cards
    set streak_count = v_count, streak_week = v_week, streak_best = greatest(streak_best, v_count)
    where id = v_card.id;

  if v_bonus > 0 then
    if v_prog.mode = 'stamps' then
      update public.cards
        set rewards_earned = rewards_earned + case when stamps_count < v_prog.reward_threshold
              and least(v_prog.reward_threshold, stamps_count + v_bonus) = v_prog.reward_threshold then 1 else 0 end,
            stamps_count = least(v_prog.reward_threshold, stamps_count + v_bonus)
        where id = v_card.id;
    elsif v_prog.mode = 'points' then
      update public.cards set points_balance = points_balance + v_bonus, lifetime_points = lifetime_points + v_bonus where id = v_card.id;
    else
      update public.cards set cashback_balance = cashback_balance + v_bonus where id = v_card.id;
    end if;
    insert into public.stamp_events (card_id, business_id, event_type, delta, note)
      values (v_card.id, v_prog.business_id, 'correction', v_bonus, 'Bonus série ' || v_count || ' semaines');
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_events_streak on public.stamp_events;
create trigger stamp_events_streak after insert on public.stamp_events
  for each row execute function public._streak_on_visit();

-- ---------- Record personnel (saisi par le commerçant après la session) ----------
create or replace function public.record_lap(p_serial uuid, p_scanner_id uuid, p_ms integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_check jsonb; v_card public.cards; v_prog public.loyalty_programs;
begin
  v_check := public._merchant_card(p_serial, p_scanner_id);
  if not (v_check->>'ok')::boolean then return v_check; end if;
  if p_ms is null or p_ms < 5000 or p_ms > 600000 then
    return jsonb_build_object('ok', false, 'error', 'Temps invalide : entre 5 secondes et 10 minutes.');
  end if;
  select * into v_card from public.cards where id = (v_check->>'card_id')::uuid for update;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if not v_prog.lap_times_enabled then
    return jsonb_build_object('ok', false, 'error', 'Les records ne sont pas activés pour cette carte.');
  end if;
  if v_card.best_lap_ms is null or p_ms < v_card.best_lap_ms then
    update public.cards set best_lap_ms = p_ms, best_lap_at = now(), updated_at = now() where id = v_card.id;
    return jsonb_build_object('ok', true, 'card_id', v_card.id, 'improved', true, 'previous_ms', v_card.best_lap_ms, 'best_ms', p_ms);
  end if;
  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'improved', false, 'best_ms', v_card.best_lap_ms);
end;
$$;

-- Cartes à relancer : série en cours, pas encore venues cette semaine, jamais relancées cette semaine
create or replace function public.streak_cards_to_remind()
returns table (card_id uuid, first_name text, business_name text, streak integer)
language sql security definer set search_path = ''
as $$
  select c.id, cu.first_name, b.name, c.streak_count
  from public.cards c
  join public.customers cu on cu.id = c.customer_id
  join public.loyalty_programs p on p.id = c.program_id
  join public.businesses b on b.id = p.business_id
  where p.streak_enabled and p.is_active and b.status = 'active'
    and cu.marketing_optin
    and c.streak_count >= 1
    and extract(dow from (now() at time zone 'America/Guadeloupe')) = p.streak_reminder_dow
    and extract(hour from (now() at time zone 'America/Guadeloupe')) >= p.streak_reminder_hour
    and c.streak_week = date_trunc('week', (now() at time zone 'America/Guadeloupe'))::date - 7
    and (c.streak_reminded_week is null or c.streak_reminded_week < date_trunc('week', (now() at time zone 'America/Guadeloupe'))::date)
  limit 200;
$$;

do $$
declare f text;
begin
  foreach f in array array['public._streak_on_visit()', 'public.record_lap(uuid, uuid, integer)', 'public.streak_cards_to_remind()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
