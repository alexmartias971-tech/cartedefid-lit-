-- Espace commerçant de walty.fr : actions « à la main » (sans scanner le QR code de la carte) et tampon « hors limite du jour ».
-- Réservé au gérant (session ouverte par e-mail/identifiant + mot de passe, vérifiée côté logiciel de cartes par un cookie signé).
-- Aucune table existante du logiciel de cartes n'est modifiée :
--   - une table nouvelle : merchant_manual_actions (qui, quoi, hors limite, raison), liée à stamp_events.id ;
--   - add_stamp_over_limit : la même logique que add_stamp, SANS la limite de passages par jour ;
--   - merchant_manual_action : retrouve la carte du client DANS le commerce de l'accès, limite à 30 actions à la main
--     par commerce et par jour (heure de Guadeloupe), appelle la fonction habituelle (add_stamp, redeem_reward, …) et note l'action.
-- Toutes les fonctions : security definer, search_path vide, EXECUTE pour service_role seulement.

create table if not exists public.merchant_manual_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  scanner_id uuid references public.scanner_access(id) on delete set null,
  scanner_label text not null default '',
  card_id uuid not null references public.cards(id) on delete cascade,
  stamp_event_id uuid unique references public.stamp_events(id) on delete cascade,
  action text not null check (action in ('stamp', 'redeem', 'purchase', 'cashback', 'reward', 'coupon')),
  over_limit boolean not null default false,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  constraint merchant_manual_actions_reason_required check (not over_limit or char_length(btrim(coalesce(reason, ''))) >= 3)
);
create index if not exists merchant_manual_actions_business_day on public.merchant_manual_actions (business_id, created_at desc);
create index if not exists merchant_manual_actions_card on public.merchant_manual_actions (card_id);

alter table public.merchant_manual_actions enable row level security;
revoke all on table public.merchant_manual_actions from anon, authenticated, public;
grant all on table public.merchant_manual_actions to service_role;

-- ------------------------------------------------------------------ tampon au-delà de la limite du jour
-- Copie fidèle de add_stamp (mêmes contrôles : accès actif, carte du commerce, programme actif, mode tampons,
-- cadeau pas encore débloqué, bonus horaire, parrainage, niveau), sans le contrôle max_stamps_per_day.
create or replace function public.add_stamp_over_limit(p_serial uuid, p_scanner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check jsonb; v_card public.cards; v_prog public.loyalty_programs; v_add integer; v_mult integer; v_ref uuid;
begin
  v_check := public._merchant_card(p_serial, p_scanner_id);
  if not (v_check->>'ok')::boolean then return v_check; end if;
  select * into v_card from public.cards where id = (v_check->>'card_id')::uuid for update;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if v_prog.mode <> 'stamps' then return jsonb_build_object('ok', false, 'error', 'Cette carte fonctionne en ' || v_prog.mode || ', pas en tampons.'); end if;
  if v_card.stamps_count >= v_prog.reward_threshold then
    return jsonb_build_object('ok', false, 'reward_ready', true, 'error', 'Le cadeau est déjà débloqué : valide-le d''abord.');
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

-- ------------------------------------------------------------------ action à la main (gérant)
create or replace function public.merchant_manual_action(
  p_scanner_id uuid,
  p_customer_id uuid,
  p_action text,
  p_amount numeric default null,
  p_item_id uuid default null,
  p_over_limit boolean default false,
  p_reason text default null
)
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
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'America/Guadeloupe')) at time zone 'America/Guadeloupe';
  v_used integer;
  v_today integer;
  v_over boolean := false;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_result jsonb;
  v_type text;
  v_event uuid;
  v_before uuid[];
begin
  if p_action is null or p_action not in ('stamp', 'redeem', 'purchase', 'cashback', 'reward', 'coupon') then
    return jsonb_build_object('ok', false, 'error', 'Action inconnue.');
  end if;

  -- L'accès : actif, commerce actif, et c'est un accès de gérant (compte e-mail/mot de passe, mot de passe provisoire changé)
  select * into v_access from public.scanner_access where id = p_scanner_id and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'Accès commerçant désactivé.'); end if;
  select status into v_biz_status from public.businesses where id = v_access.business_id;
  if v_biz_status is distinct from 'active' then return jsonb_build_object('ok', false, 'error', 'Ce compte est suspendu.'); end if;
  if not exists (select 1 from public.merchant_logins m where m.scanner_access_id = p_scanner_id and not m.must_change_password) then
    return jsonb_build_object('ok', false, 'forbidden', true, 'error', 'Réservé au gérant (connexion par e-mail et mot de passe).');
  end if;

  -- La carte du client, dans le commerce de CET accès uniquement
  select c.* into v_card
    from public.cards c
    join public.loyalty_programs p on p.id = c.program_id
    join public.customers cu on cu.id = c.customer_id
   where c.customer_id = p_customer_id and p.business_id = v_access.business_id and cu.business_id = v_access.business_id
   order by c.created_at asc
   limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'Client introuvable.'); end if;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;

  -- Limite : 30 actions à la main par commerce et par jour (une à la fois par commerce)
  perform pg_advisory_xact_lock(hashtext('walty-manual:' || v_access.business_id::text));
  select count(*) into v_used from public.merchant_manual_actions
   where business_id = v_access.business_id and created_at >= v_day_start;
  if v_used >= c_daily_max then
    return jsonb_build_object('ok', false, 'rate_limited', true,
      'error', 'Limite atteinte : ' || c_daily_max || ' actions à la main par jour. Scannez la carte du client, ou appelez Walty.');
  end if;

  -- Passages déjà écrits dans cette transaction (normalement aucun) : pour retrouver à coup sûr le nouveau
  v_before := array(select e.id from public.stamp_events e where e.card_id = v_card.id and e.created_at = now());

  if p_action = 'stamp' then
    select count(*) into v_today from public.stamp_events
     where card_id = v_card.id and event_type in ('stamp', 'purchase') and undone_at is null and created_at >= v_day_start;
    if v_today >= v_prog.max_stamps_per_day then
      if not coalesce(p_over_limit, false) then
        return jsonb_build_object('ok', false, 'limit_reached', true,
          'error', 'Limite atteinte : ' || v_prog.max_stamps_per_day || ' passage(s) par jour pour ce client.');
      end if;
      if v_reason is null or char_length(v_reason) < 3 then
        return jsonb_build_object('ok', false, 'error', 'Indiquez la raison du tampon hors limite (3 caractères au moins).');
      end if;
      v_over := true;
      v_result := public.add_stamp_over_limit(v_card.serial_number, p_scanner_id);
    else
      v_result := public.add_stamp(v_card.serial_number, p_scanner_id);
    end if;
    v_type := 'stamp';
  elsif p_action = 'redeem' then
    v_result := public.redeem_reward(v_card.serial_number, p_scanner_id); v_type := 'reward_redeemed';
  elsif p_action = 'purchase' then
    v_result := public.record_purchase(v_card.serial_number, p_scanner_id, p_amount); v_type := 'purchase';
  elsif p_action = 'cashback' then
    v_result := public.use_cashback(v_card.serial_number, p_scanner_id, p_amount); v_type := 'cashback_used';
  elsif p_action = 'reward' then
    if p_item_id is null then return jsonb_build_object('ok', false, 'error', 'Cadeau inconnu.'); end if;
    v_result := public.redeem_catalog_reward(v_card.serial_number, p_scanner_id, p_item_id); v_type := 'points_redeemed';
  else
    if p_item_id is null then return jsonb_build_object('ok', false, 'error', 'Offre inconnue.'); end if;
    v_result := public.use_coupon(v_card.serial_number, p_scanner_id, p_item_id); v_type := 'coupon_used';
  end if;

  if v_result is null or not coalesce((v_result->>'ok')::boolean, false) then
    return coalesce(v_result, jsonb_build_object('ok', false, 'error', 'Action impossible.'));
  end if;

  -- Le passage qui vient d'être écrit (même transaction : created_at = now())
  select id into v_event from public.stamp_events
   where card_id = v_card.id and scanner_id = p_scanner_id and event_type = v_type and created_at = now()
     and not (id = any(v_before))
   order by id limit 1;

  insert into public.merchant_manual_actions (business_id, scanner_id, scanner_label, card_id, stamp_event_id, action, over_limit, reason)
  values (v_access.business_id, p_scanner_id, coalesce(v_access.label, ''), v_card.id, v_event, p_action, v_over,
          case when v_reason is null then null else left(v_reason, 200) end);

  return v_result || jsonb_build_object('manual', true, 'over_limit', v_over, 'event_id', v_event,
    'card_id', v_card.id, 'manual_left', c_daily_max - v_used - 1);
end;
$$;

revoke all on function public.add_stamp_over_limit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.merchant_manual_action(uuid, uuid, text, numeric, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.add_stamp_over_limit(uuid, uuid) to service_role;
grant execute on function public.merchant_manual_action(uuid, uuid, text, numeric, uuid, boolean, text) to service_role;
