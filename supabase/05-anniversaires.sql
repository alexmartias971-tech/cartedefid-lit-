-- =====================================================================
-- Offre d'anniversaire : liste des cartes dont c'est l'anniversaire aujourd'hui
-- (heure de Guadeloupe) et qui n'ont pas encore reçu leur offre cette année.
-- =====================================================================
create or replace function public.birthday_cards_today()
returns table (card_id uuid, program_id uuid, offer text, first_name text, business_name text, marketing_optin boolean)
language sql stable security definer set search_path = ''
as $$
  select c.id, p.id, p.birthday_offer, cu.first_name, b.name, cu.marketing_optin
  from public.cards c
  join public.customers cu on cu.id = c.customer_id
  join public.loyalty_programs p on p.id = c.program_id
  join public.businesses b on b.id = p.business_id
  where p.birthday_offer is not null and p.is_active and b.status = 'active'
    and cu.birth_date is not null
    and extract(month from cu.birth_date) = extract(month from (now() at time zone 'America/Guadeloupe'))
    and extract(day from cu.birth_date) = extract(day from (now() at time zone 'America/Guadeloupe'))
    and not exists (
      select 1 from public.coupons k
      where k.card_id = c.id and k.kind = 'birthday'
        and extract(year from (k.created_at at time zone 'UTC')) = extract(year from (now() at time zone 'UTC'))
    )
  limit 200;
$$;
revoke execute on function public.birthday_cards_today() from public, anon, authenticated;
grant execute on function public.birthday_cards_today() to service_role;
