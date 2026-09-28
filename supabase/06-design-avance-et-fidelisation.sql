-- =====================================================================
-- MISE À JOUR : design avancé (décors, icônes, styles de progression, textes)
-- + mécaniques de fidélisation (bonus d'inscription, happy hour, parrainage,
--   géolocalisation, lien avis Google). Ne supprime aucune donnée.
-- =====================================================================

alter table public.loyalty_programs
  add column if not exists decor_preset text not null default 'none',
  add column if not exists progress_style text not null default 'grid',
  add column if not exists stamps_position text not null default 'center',
  add column if not exists icon_preset text not null default 'check',
  add column if not exists collection_icons text[] not null default '{}',
  add column if not exists vessel text not null default 'glass',
  add column if not exists fill_color text not null default '#8FD16A',
  add column if not exists reward_on_last boolean not null default true,
  add column if not exists show_logo_text boolean not null default true,
  add column if not exists label_balance text,
  add column if not exists label_customer text,
  add column if not exists label_reward text,
  add column if not exists signup_bonus integer not null default 0,
  add column if not exists bonus_multiplier integer not null default 1,
  add column if not exists bonus_start_hour integer,
  add column if not exists bonus_end_hour integer,
  add column if not exists referral_bonus integer not null default 0;

alter table public.loyalty_programs drop constraint if exists loyalty_programs_design_check;
alter table public.loyalty_programs add constraint loyalty_programs_design_check check (
  progress_style in ('grid', 'collection', 'fill', 'none')
  and stamps_position in ('center', 'right', 'bottom')
  and vessel in ('glass', 'cup')
  and signup_bonus between 0 and 1000
  and bonus_multiplier between 1 and 3
  and (bonus_start_hour is null or bonus_start_hour between 0 and 23)
  and (bonus_end_hour is null or bonus_end_hour between 1 and 24)
  and referral_bonus between 0 and 1000
);

alter table public.businesses
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists relevant_text text,
  add column if not exists google_review_url text,
  add column if not exists instagram_url text;

alter table public.cards
  add column if not exists referral_code text,
  add column if not exists referred_by_card_id uuid references public.cards(id) on delete set null,
  add column if not exists referral_rewarded boolean not null default false;
update public.cards set referral_code = upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8)) where referral_code is null;
alter table public.cards alter column referral_code set default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
alter table public.cards alter column referral_code set not null;
create unique index if not exists cards_referral_code_idx on public.cards (referral_code);

-- Happy hour : multiplicateur actif maintenant ? (heure de Guadeloupe)
create or replace function public._bonus_multiplier(p_prog public.loyalty_programs)
returns integer language sql stable set search_path = ''
as $$
  select case
    when p_prog.bonus_multiplier > 1 and p_prog.bonus_start_hour is not null and p_prog.bonus_end_hour is not null
     and extract(hour from (now() at time zone 'America/Guadeloupe')) >= p_prog.bonus_start_hour
     and extract(hour from (now() at time zone 'America/Guadeloupe')) < p_prog.bonus_end_hour
    then p_prog.bonus_multiplier else 1 end;
$$;

-- Parrainage : au premier passage du filleul, le parrain reçoit son bonus
create or replace function public._reward_referrer(p_card public.cards, p_prog public.loyalty_programs)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_ref public.cards;
begin
  if p_card.referred_by_card_id is null or p_card.referral_rewarded or p_prog.referral_bonus <= 0 or p_card.lifetime_visits <> 1 then
    return null;
  end if;
  select * into v_ref from public.cards where id = p_card.referred_by_card_id and program_id = p_card.program_id for update;
  if not found then return null; end if;
  if p_prog.mode = 'stamps' then
    update public.cards
      set rewards_earned = rewards_earned + case when stamps_count < p_prog.reward_threshold
            and least(p_prog.reward_threshold, stamps_count + p_prog.referral_bonus) = p_prog.reward_threshold then 1 else 0 end,
          stamps_count = least(p_prog.reward_threshold, stamps_count + p_prog.referral_bonus)
      where id = v_ref.id;
  elsif p_prog.mode = 'points' then
    update public.cards set points_balance = points_balance + p_prog.referral_bonus,
      lifetime_points = lifetime_points + p_prog.referral_bonus where id = v_ref.id;
  else
    update public.cards set cashback_balance = cashback_balance + p_prog.referral_bonus where id = v_ref.id;
  end if;
  update public.cards set referral_rewarded = true where id = p_card.id;
  insert into public.stamp_events (card_id, business_id, event_type, delta, note)
    values (v_ref.id, p_prog.business_id, 'correction', p_prog.referral_bonus, 'Bonus parrainage');
  return v_ref.id;
end;
$$;

-- Tampon : happy hour + parrainage
create or replace function public.add_stamp(p_serial uuid, p_scanner_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_check jsonb; v_card public.cards; v_prog public.loyalty_programs; v_today integer; v_add integer; v_mult integer; v_ref uuid;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'America/Guadeloupe')) at time zone 'America/Guadeloupe';
begin
  v_check := public._merchant_card(p_serial, p_scanner_id);
  if not (v_check->>'ok')::boolean then return v_check; end if;
  select * into v_card from public.cards where id = (v_check->>'card_id')::uuid for update;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if v_prog.mode <> 'stamps' then return jsonb_build_object('ok', false, 'error', 'Cette carte fonctionne en ' || v_prog.mode || ', pas en tampons.'); end if;
  if v_card.stamps_count >= v_prog.reward_threshold then
    return jsonb_build_object('ok', false, 'reward_ready', true, 'error', 'Le cadeau est déjà débloqué : valide-le d''abord.');
  end if;
  select count(*) into v_today from public.stamp_events
    where card_id = v_card.id and event_type in ('stamp', 'purchase') and undone_at is null and created_at >= v_day_start;
  if v_today >= v_prog.max_stamps_per_day then
    return jsonb_build_object('ok', false, 'error', 'Limite atteinte : ' || v_prog.max_stamps_per_day || ' passage(s) par jour pour ce client.');
  end if;

  v_mult := public._bonus_multiplier(v_prog);
  v_add := least(v_mult, v_prog.reward_threshold - v_card.stamps_count);
  update public.cards
    set stamps_count = stamps_count + v_add,
        lifetime_visits = lifetime_visits + 1,
        rewards_earned = rewards_earned + case when stamps_count + v_add >= v_prog.reward_threshold then 1 else 0 end,
        winback_sent_at = null
    where id = v_card.id returning * into v_card;
  update public.customers set last_visit_at = now() where id = v_card.customer_id;
  update public.scanner_access set last_used_at = now() where id = p_scanner_id;
  insert into public.stamp_events (card_id, business_id, scanner_id, event_type, delta)
    values (v_card.id, v_prog.business_id, p_scanner_id, 'stamp', v_add);
  perform public.refresh_card_tier(v_card.id);
  v_ref := public._reward_referrer(v_card, v_prog);

  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'stamps', v_card.stamps_count, 'added', v_add,
    'bonus', v_mult > 1, 'referrer_card_id', v_ref,
    'threshold', v_prog.reward_threshold, 'reward_ready', v_card.stamps_count >= v_prog.reward_threshold);
end;
$$;

-- Achat : happy hour + parrainage
create or replace function public.record_purchase(p_serial uuid, p_scanner_id uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_check jsonb; v_card public.cards; v_prog public.loyalty_programs; v_today integer; v_mult integer; v_ref uuid;
  v_points integer := 0; v_cash numeric(10,2) := 0;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'America/Guadeloupe')) at time zone 'America/Guadeloupe';
begin
  v_check := public._merchant_card(p_serial, p_scanner_id);
  if not (v_check->>'ok')::boolean then return v_check; end if;
  select * into v_card from public.cards where id = (v_check->>'card_id')::uuid for update;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if v_prog.mode = 'stamps' then return jsonb_build_object('ok', false, 'error', 'Cette carte fonctionne en tampons.'); end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'Indique le montant de l''achat.'); end if;
  if p_amount > v_prog.max_purchase_amount then
    return jsonb_build_object('ok', false, 'error', 'Montant trop élevé (maximum ' || v_prog.max_purchase_amount || ' €). Vérifie la saisie.');
  end if;
  select count(*) into v_today from public.stamp_events
    where card_id = v_card.id and event_type in ('stamp', 'purchase') and undone_at is null and created_at >= v_day_start;
  if v_today >= v_prog.max_stamps_per_day then
    return jsonb_build_object('ok', false, 'error', 'Limite atteinte : ' || v_prog.max_stamps_per_day || ' passage(s) par jour pour ce client.');
  end if;

  v_mult := public._bonus_multiplier(v_prog);
  if v_prog.mode = 'points' then v_points := floor(p_amount * v_prog.points_per_euro * v_mult);
  else v_cash := round(p_amount * v_prog.cashback_percent * v_mult / 100, 2); end if;

  update public.cards
    set points_balance = points_balance + v_points,
        lifetime_points = lifetime_points + v_points,
        cashback_balance = cashback_balance + v_cash,
        lifetime_visits = lifetime_visits + 1,
        lifetime_spent = lifetime_spent + p_amount,
        winback_sent_at = null
    where id = v_card.id returning * into v_card;
  update public.customers set last_visit_at = now() where id = v_card.customer_id;
  update public.scanner_access set last_used_at = now() where id = p_scanner_id;
  insert into public.stamp_events (card_id, business_id, scanner_id, event_type, delta, amount, points, cashback)
    values (v_card.id, v_prog.business_id, p_scanner_id, 'purchase', 1, p_amount, v_points, v_cash);
  perform public.refresh_card_tier(v_card.id);
  v_ref := public._reward_referrer(v_card, v_prog);

  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'points_added', v_points, 'cashback_added', v_cash,
    'bonus', v_mult > 1, 'referrer_card_id', v_ref, 'points', v_card.points_balance, 'cashback', v_card.cashback_balance);
end;
$$;

-- Annulation : tient compte des tampons doublés (delta)
create or replace function public.undo_last_action(p_serial uuid, p_scanner_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_card public.cards; v_prog public.loyalty_programs; v_event public.stamp_events;
begin
  select * into v_card from public.cards where serial_number = p_serial for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Carte inconnue.'); end if;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  select * into v_event from public.stamp_events
    where card_id = v_card.id and scanner_id = p_scanner_id and event_type in ('stamp', 'purchase')
      and undone_at is null and created_at > now() - interval '10 minutes'
    order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'Rien à annuler (10 minutes maximum).'); end if;

  if v_event.event_type = 'stamp' then
    update public.cards
      set rewards_earned = rewards_earned - case when stamps_count >= v_prog.reward_threshold
            and stamps_count - v_event.delta < v_prog.reward_threshold then 1 else 0 end,
          stamps_count = greatest(0, stamps_count - v_event.delta),
          lifetime_visits = greatest(0, lifetime_visits - 1)
      where id = v_card.id returning * into v_card;
  else
    if v_card.points_balance < coalesce(v_event.points, 0) or v_card.cashback_balance < coalesce(v_event.cashback, 0) then
      return jsonb_build_object('ok', false, 'error', 'Impossible : les points ou la cagnotte ont déjà été utilisés.');
    end if;
    update public.cards
      set points_balance = points_balance - coalesce(v_event.points, 0),
          lifetime_points = greatest(0, lifetime_points - coalesce(v_event.points, 0)),
          cashback_balance = cashback_balance - coalesce(v_event.cashback, 0),
          lifetime_visits = greatest(0, lifetime_visits - 1),
          lifetime_spent = greatest(0, lifetime_spent - coalesce(v_event.amount, 0))
      where id = v_card.id returning * into v_card;
  end if;
  update public.stamp_events set undone_at = now() where id = v_event.id;
  perform public.refresh_card_tier(v_card.id);
  return jsonb_build_object('ok', true, 'card_id', v_card.id);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public._bonus_multiplier(public.loyalty_programs)', 'public._reward_referrer(public.cards, public.loyalty_programs)',
    'public.add_stamp(uuid, uuid)', 'public.record_purchase(uuid, uuid, numeric)', 'public.undo_last_action(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
