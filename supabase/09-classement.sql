-- 09 : classement des meilleurs tours (position P1, P2… sur la carte) + classement public (avec accord du client)

alter table public.cards add column if not exists lap_rank integer;
alter table public.customers add column if not exists leaderboard_optin boolean not null default false;

-- Nouveau record : met à jour le record, recalcule le classement du programme
-- et renvoie les pilotes qui viennent d'être dépassés (pour les prévenir).
create or replace function public.record_lap(p_serial uuid, p_scanner_id uuid, p_ms integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_check jsonb; v_card public.cards; v_prog public.loyalty_programs; v_over jsonb; v_rank integer; v_total integer;
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
  if v_card.best_lap_ms is not null and p_ms >= v_card.best_lap_ms then
    return jsonb_build_object('ok', true, 'card_id', v_card.id, 'improved', false, 'best_ms', v_card.best_lap_ms, 'rank', v_card.lap_rank);
  end if;

  update public.cards set best_lap_ms = p_ms, best_lap_at = now(), updated_at = now() where id = v_card.id;

  with prev as (
    select id, lap_rank from public.cards where program_id = v_prog.id and best_lap_ms is not null
  ), ranked as (
    select id, row_number() over (order by best_lap_ms, best_lap_at) as rk
    from public.cards where program_id = v_prog.id and best_lap_ms is not null
  ), upd as (
    update public.cards c set lap_rank = r.rk, updated_at = case when c.id <> v_card.id and c.lap_rank is distinct from r.rk then now() else c.updated_at end
    from ranked r join prev b on b.id = r.id
    where c.id = r.id and c.lap_rank is distinct from r.rk
    returning c.id, r.rk as new_rank, b.lap_rank as old_rank
  )
  select coalesce(jsonb_agg(jsonb_build_object('card_id', id, 'rank', new_rank) order by new_rank)
           filter (where id <> v_card.id and old_rank is not null and new_rank > old_rank), '[]'::jsonb)
    into v_over from upd;

  select lap_rank into v_rank from public.cards where id = v_card.id;
  select count(*) into v_total from public.cards where program_id = v_prog.id and best_lap_ms is not null;
  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'improved', true, 'previous_ms', v_card.best_lap_ms,
    'best_ms', p_ms, 'rank', v_rank, 'previous_rank', v_card.lap_rank, 'total', v_total, 'overtaken', v_over);
end;
$$;

-- Classement public : seulement le prénom + initiale des clients qui ont accepté d'y figurer
create or replace function public.lap_leaderboard(p_slug text, p_limit integer default 20)
returns table (rank integer, pilot text, best_lap_ms integer, tier text)
language sql security definer set search_path = ''
as $$
  select c.lap_rank, case when cu.leaderboard_optin
      then cu.first_name || coalesce(' ' || left(cu.last_name, 1) || '.', '')
      else 'Pilote anonyme' end,
    c.best_lap_ms, t.name
  from public.cards c
  join public.customers cu on cu.id = c.customer_id
  join public.loyalty_programs p on p.id = c.program_id
  join public.businesses b on b.id = p.business_id
  left join public.program_tiers t on t.id = c.tier_id
  where b.slug = p_slug and b.status = 'active' and p.lap_times_enabled and c.best_lap_ms is not null
  order by c.best_lap_ms, c.best_lap_at
  limit least(greatest(p_limit, 1), 100);
$$;

do $$
declare f text;
begin
  foreach f in array array['public.record_lap(uuid, uuid, integer)', 'public.lap_leaderboard(text, integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
