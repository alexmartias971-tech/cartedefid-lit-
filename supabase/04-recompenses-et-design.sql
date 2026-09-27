-- =====================================================================
-- MISE À JOUR : tous les modes de récompense + personnalisation du design
-- (tampons, points, cashback, niveaux, catalogue de cadeaux, offres/coupons,
--  image de décor, icônes de tampons)
-- À lancer UNE FOIS, après 01-schema.sql. Ne supprime aucune donnée.
-- =====================================================================

-- 1. Le programme : mode de récompense et design ------------------------
alter table public.loyalty_programs
  add column if not exists mode text not null default 'stamps',
  add column if not exists points_per_euro numeric(8,2) not null default 1,
  add column if not exists cashback_percent numeric(5,2) not null default 5,
  add column if not exists strip_image_url text,          -- image de décor (bannière)
  add column if not exists stamp_icon_url text,           -- icône tampon rempli
  add column if not exists stamp_empty_icon_url text,     -- icône tampon vide
  add column if not exists stamp_color text not null default '#FFFFFF',
  add column if not exists strip_overlay integer not null default 25, -- voile sombre sur le décor (0-80 %)
  add column if not exists tiers_enabled boolean not null default false,
  add column if not exists tier_basis text not null default 'visits',
  add column if not exists welcome_offer text,            -- offre de bienvenue (coupon)
  add column if not exists birthday_offer text,           -- offre anniversaire (coupon)
  add column if not exists max_purchase_amount numeric(10,2) not null default 1000;

alter table public.loyalty_programs drop constraint if exists loyalty_programs_mode_check;
alter table public.loyalty_programs add constraint loyalty_programs_mode_check
  check (mode in ('stamps', 'points', 'cashback'));
alter table public.loyalty_programs drop constraint if exists loyalty_programs_tier_basis_check;
alter table public.loyalty_programs add constraint loyalty_programs_tier_basis_check
  check (tier_basis in ('visits', 'spend'));
alter table public.loyalty_programs drop constraint if exists loyalty_programs_rates_check;
alter table public.loyalty_programs add constraint loyalty_programs_rates_check
  check (points_per_euro > 0 and points_per_euro <= 100
     and cashback_percent > 0 and cashback_percent <= 50
     and strip_overlay between 0 and 80
     and max_purchase_amount between 1 and 100000);

-- 2. Niveaux (Bronze, Argent, Or…) --------------------------------------
create table if not exists public.program_tiers (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  name text not null,
  min_value numeric(12,2) not null default 0,   -- passages ou € dépensés pour l'atteindre
  perk text,                                    -- avantage : "-10 % sur tout"
  color text,                                   -- couleur de fond de la carte à ce niveau
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists program_tiers_program_idx on public.program_tiers (program_id, min_value);

-- 3. Catalogue de cadeaux (mode points) ---------------------------------
create table if not exists public.reward_catalog (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  name text not null,
  cost integer not null check (cost > 0),       -- prix en points
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists reward_catalog_program_idx on public.reward_catalog (program_id, cost);

-- 4. La carte : soldes et niveau ----------------------------------------
alter table public.cards
  add column if not exists points_balance integer not null default 0,
  add column if not exists cashback_balance numeric(10,2) not null default 0,
  add column if not exists lifetime_visits integer not null default 0,
  add column if not exists lifetime_spent numeric(12,2) not null default 0,
  add column if not exists lifetime_points integer not null default 0,
  add column if not exists tier_id uuid references public.program_tiers(id) on delete set null;
alter table public.cards drop constraint if exists cards_balances_check;
alter table public.cards add constraint cards_balances_check check (points_balance >= 0 and cashback_balance >= 0);

-- Les tampons déjà donnés comptent comme des passages
update public.cards c set lifetime_visits = greatest(c.lifetime_visits, (
  select count(*) from public.stamp_events e where e.card_id = c.id and e.event_type = 'stamp' and e.undone_at is null
));

-- 5. Offres / coupons (bienvenue, anniversaire, offres ponctuelles) -----
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind text not null default 'manual' check (kind in ('welcome', 'birthday', 'manual')),
  status text not null default 'active' check (status in ('active', 'used', 'expired')),
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists coupons_card_idx on public.coupons (card_id, status);
create unique index if not exists coupons_one_birthday_per_year
  on public.coupons (card_id, (extract(year from (created_at at time zone 'UTC'))::int)) where kind = 'birthday';

-- 6. Historique : achats, points, cashback, coupons ---------------------
alter table public.stamp_events
  add column if not exists amount numeric(10,2),
  add column if not exists points integer,
  add column if not exists cashback numeric(10,2),
  add column if not exists reward_id uuid references public.reward_catalog(id) on delete set null,
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null;
alter table public.stamp_events drop constraint if exists stamp_events_event_type_check;
alter table public.stamp_events add constraint stamp_events_event_type_check
  check (event_type in ('stamp', 'reward_redeemed', 'correction', 'purchase', 'points_redeemed', 'cashback_used', 'coupon_used'));

-- 7. Sécurité RLS des nouvelles tables ----------------------------------
do $$
declare t text;
begin
  foreach t in array array['program_tiers', 'reward_catalog', 'coupons'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Admin: accès complet" on public.%I', t);
    execute format(
      'create policy "Admin: accès complet" on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- 8. FONCTIONS ---------------------------------------------------------

-- 8a. Recalcule le niveau d'une carte (et met la carte à jour)
create or replace function public.refresh_card_tier(p_card_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_card public.cards; v_prog public.loyalty_programs; v_metric numeric; v_tier uuid;
begin
  select * into v_card from public.cards where id = p_card_id;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if not v_prog.tiers_enabled then
    if v_card.tier_id is not null then update public.cards set tier_id = null where id = p_card_id; end if;
    return;
  end if;
  v_metric := case when v_prog.tier_basis = 'spend' then v_card.lifetime_spent else v_card.lifetime_visits end;
  select id into v_tier from public.program_tiers
    where program_id = v_prog.id and min_value <= v_metric
    order by min_value desc, sort desc limit 1;
  if v_tier is distinct from v_card.tier_id then
    update public.cards set tier_id = v_tier where id = p_card_id;
  end if;
end;
$$;

-- 8b. Vérifications communes : accès commerçant + carte du bon commerce
create or replace function public._merchant_card(p_serial uuid, p_scanner_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_access public.scanner_access; v_card public.cards; v_prog public.loyalty_programs;
begin
  select * into v_access from public.scanner_access where id = p_scanner_id and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'Accès commerçant désactivé.'); end if;
  select * into v_card from public.cards where serial_number = p_serial;
  if not found then return jsonb_build_object('ok', false, 'error', 'Carte inconnue.'); end if;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if v_prog.business_id <> v_access.business_id then
    return jsonb_build_object('ok', false, 'error', 'Cette carte appartient à un autre commerce.');
  end if;
  if not v_prog.is_active then return jsonb_build_object('ok', false, 'error', 'Le programme de fidélité est en pause.'); end if;
  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'program_id', v_prog.id, 'business_id', v_access.business_id);
end;
$$;

-- 8c. Tampon (mode tampons) : on garde la fonction et on ajoute passages + niveau
create or replace function public.add_stamp(p_serial uuid, p_scanner_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_check jsonb; v_card public.cards; v_prog public.loyalty_programs; v_today integer;
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

  update public.cards
    set stamps_count = stamps_count + 1,
        lifetime_visits = lifetime_visits + 1,
        rewards_earned = rewards_earned + case when stamps_count + 1 = v_prog.reward_threshold then 1 else 0 end,
        winback_sent_at = null
    where id = v_card.id returning * into v_card;
  update public.customers set last_visit_at = now() where id = v_card.customer_id;
  update public.scanner_access set last_used_at = now() where id = p_scanner_id;
  insert into public.stamp_events (card_id, business_id, scanner_id, event_type, delta)
    values (v_card.id, v_prog.business_id, p_scanner_id, 'stamp', 1);
  perform public.refresh_card_tier(v_card.id);

  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'stamps', v_card.stamps_count,
    'threshold', v_prog.reward_threshold, 'reward_ready', v_card.stamps_count >= v_prog.reward_threshold);
end;
$$;

-- 8d. Achat (modes points et cashback) : le commerçant tape le montant
create or replace function public.record_purchase(p_serial uuid, p_scanner_id uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_check jsonb; v_card public.cards; v_prog public.loyalty_programs; v_today integer;
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

  if v_prog.mode = 'points' then v_points := floor(p_amount * v_prog.points_per_euro);
  else v_cash := round(p_amount * v_prog.cashback_percent / 100, 2); end if;

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

  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'points_added', v_points, 'cashback_added', v_cash,
    'points', v_card.points_balance, 'cashback', v_card.cashback_balance);
end;
$$;

-- 8e. Échanger des points contre un cadeau du catalogue
create or replace function public.redeem_catalog_reward(p_serial uuid, p_scanner_id uuid, p_reward_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_check jsonb; v_card public.cards; v_reward public.reward_catalog;
begin
  v_check := public._merchant_card(p_serial, p_scanner_id);
  if not (v_check->>'ok')::boolean then return v_check; end if;
  select * into v_card from public.cards where id = (v_check->>'card_id')::uuid for update;
  select * into v_reward from public.reward_catalog where id = p_reward_id and program_id = v_card.program_id and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'Cadeau introuvable.'); end if;
  if v_card.points_balance < v_reward.cost then
    return jsonb_build_object('ok', false, 'error', 'Pas assez de points (' || v_card.points_balance || ' / ' || v_reward.cost || ').');
  end if;
  update public.cards set points_balance = points_balance - v_reward.cost, rewards_redeemed = rewards_redeemed + 1
    where id = v_card.id returning * into v_card;
  insert into public.stamp_events (card_id, business_id, scanner_id, event_type, delta, points, reward_id, note)
    values (v_card.id, (v_check->>'business_id')::uuid, p_scanner_id, 'points_redeemed', -1, -v_reward.cost, v_reward.id, v_reward.name);
  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'points', v_card.points_balance, 'reward', v_reward.name);
end;
$$;

-- 8f. Utiliser la cagnotte cashback
create or replace function public.use_cashback(p_serial uuid, p_scanner_id uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_check jsonb; v_card public.cards;
begin
  v_check := public._merchant_card(p_serial, p_scanner_id);
  if not (v_check->>'ok')::boolean then return v_check; end if;
  select * into v_card from public.cards where id = (v_check->>'card_id')::uuid for update;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'Indique le montant à utiliser.'); end if;
  if p_amount > v_card.cashback_balance then
    return jsonb_build_object('ok', false, 'error', 'La cagnotte ne contient que ' || v_card.cashback_balance || ' €.');
  end if;
  update public.cards set cashback_balance = cashback_balance - round(p_amount, 2) where id = v_card.id returning * into v_card;
  insert into public.stamp_events (card_id, business_id, scanner_id, event_type, delta, cashback)
    values (v_card.id, (v_check->>'business_id')::uuid, p_scanner_id, 'cashback_used', -1, -round(p_amount, 2));
  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'cashback', v_card.cashback_balance);
end;
$$;

-- 8g. Utiliser une offre (coupon)
create or replace function public.use_coupon(p_serial uuid, p_scanner_id uuid, p_coupon_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_check jsonb; v_coupon public.coupons;
begin
  v_check := public._merchant_card(p_serial, p_scanner_id);
  if not (v_check->>'ok')::boolean then return v_check; end if;
  select * into v_coupon from public.coupons
    where id = p_coupon_id and card_id = (v_check->>'card_id')::uuid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offre introuvable.'); end if;
  if v_coupon.status <> 'active' or (v_coupon.expires_at is not null and v_coupon.expires_at < now()) then
    return jsonb_build_object('ok', false, 'error', 'Cette offre a déjà été utilisée ou a expiré.');
  end if;
  update public.coupons set status = 'used', used_at = now() where id = v_coupon.id;
  update public.cards set updated_at = now() where id = v_coupon.card_id;
  insert into public.stamp_events (card_id, business_id, scanner_id, event_type, delta, coupon_id, note)
    values (v_coupon.card_id, (v_check->>'business_id')::uuid, p_scanner_id, 'coupon_used', 0, v_coupon.id, v_coupon.title);
  return jsonb_build_object('ok', true, 'card_id', v_coupon.card_id, 'coupon', v_coupon.title);
end;
$$;

-- 8h. Annuler le dernier tampon OU le dernier achat (10 minutes max)
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
      set rewards_earned = rewards_earned - case when stamps_count = v_prog.reward_threshold then 1 else 0 end,
          stamps_count = greatest(0, stamps_count - 1),
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

-- Ancienne fonction d'annulation : redirige vers la nouvelle
create or replace function public.undo_last_stamp(p_serial uuid, p_scanner_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$ select public.undo_last_action(p_serial, p_scanner_id); $$;

-- 8i. Recalculer les niveaux de toutes les cartes d'un programme (après modification des niveaux)
create or replace function public.refresh_program_tiers(p_program_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare r record; n integer := 0;
begin
  if not (public.is_admin() or (select auth.role()) = 'service_role') then raise exception 'Accès refusé'; end if;
  for r in select id from public.cards where program_id = p_program_id loop
    perform public.refresh_card_tier(r.id); n := n + 1;
  end loop;
  return n;
end;
$$;

-- Droits : uniquement le serveur de l'application (clé secrète)
do $$
declare f text;
begin
  foreach f in array array[
    'public.refresh_card_tier(uuid)', 'public._merchant_card(uuid, uuid)', 'public.add_stamp(uuid, uuid)',
    'public.record_purchase(uuid, uuid, numeric)', 'public.redeem_catalog_reward(uuid, uuid, uuid)',
    'public.use_cashback(uuid, uuid, numeric)', 'public.use_coupon(uuid, uuid, uuid)',
    'public.undo_last_action(uuid, uuid)', 'public.undo_last_stamp(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke execute on function public.refresh_program_tiers(uuid) from public, anon;
grant execute on function public.refresh_program_tiers(uuid) to authenticated, service_role;
