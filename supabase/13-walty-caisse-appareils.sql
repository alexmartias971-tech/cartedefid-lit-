-- 022 — Walty Caisse : appareils mémorisés 90 jours (espace commerçant walty.fr / logiciel de cartes cartedefid).
-- Appliquée le 24 oct. 2026 (migration « appareils_caisse »).
--
-- 1) merchant_device_revocations : « Déconnecter tous les appareils » (gérant). Une ligne par accès (scanner_access) ;
--    tout badge de session et tout cookie d'appareil émis AVANT devices_revoked_at est refusé.
--    Table fermée (RLS sans règle) : seul le serveur (service_role) la lit / l'écrit.
-- 2) merchant_device_state(accès, compte gérant) : en UNE lecture, ce que le serveur doit vérifier pour renouveler la
--    session d'un appareil mémorisé : accès et commerce actifs, date de la déconnexion générale, compte gérant toujours
--    lié à l'accès, et une EMPREINTE (md5) du code PIN / du mot de passe tels qu'ils sont enregistrés (bcrypt).
--    Code PIN ou mot de passe changé => empreinte différente => l'appareil doit se reconnecter.
--    Le serveur ne garde dans le cookie qu'un HMAC (secret MERCHANT_SESSION_SECRET) de cette empreinte.
-- 3) merchant_revoke_devices(accès, compte gérant) : pose la date de la déconnexion générale (horloge réelle).
-- Fonctions réservées à service_role (comme verify_merchant_pin / verify_merchant_login).

create table if not exists public.merchant_device_revocations (
  scanner_access_id uuid primary key references public.scanner_access(id) on delete cascade,
  devices_revoked_at timestamptz not null default now(),
  revoked_by uuid null references public.merchant_logins(id) on delete set null
);
alter table public.merchant_device_revocations enable row level security;
revoke all on table public.merchant_device_revocations from anon, authenticated;
grant select, insert, update, delete on table public.merchant_device_revocations to service_role;
comment on table public.merchant_device_revocations is
  'Walty Caisse : « Déconnecter tous les appareils » (gérant). Sessions et appareils émis avant devices_revoked_at refusés.';

create or replace function public.merchant_device_state(p_scanner_id uuid, p_login_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'found', sa.id is not null,
    'active', coalesce(sa.is_active, false) and coalesce(b.status = 'active', false),
    'revoked_at', r.devices_revoked_at,
    'pin_fp', case when sa.pin_hash is null then null else md5(sa.pin_hash) end,
    'login_ok', ml.id is not null,
    'pwd_fp', case when ml.password_hash is null then null else md5(ml.password_hash) end
  )
  from (select p_scanner_id as id) x
  left join public.scanner_access sa on sa.id = x.id
  left join public.businesses b on b.id = sa.business_id
  left join public.merchant_device_revocations r on r.scanner_access_id = sa.id
  left join public.merchant_logins ml on ml.id = p_login_id and ml.scanner_access_id = sa.id;
$$;

create or replace function public.merchant_revoke_devices(p_scanner_id uuid, p_login_id uuid default null)
returns timestamptz
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_at timestamptz := clock_timestamp();
begin
  if not exists (select 1 from public.scanner_access where id = p_scanner_id) then
    return null;
  end if;
  insert into public.merchant_device_revocations (scanner_access_id, devices_revoked_at, revoked_by)
  values (p_scanner_id, v_at, p_login_id)
  on conflict (scanner_access_id) do update
    set devices_revoked_at = excluded.devices_revoked_at, revoked_by = excluded.revoked_by;
  return v_at;
end;
$$;

revoke execute on function public.merchant_device_state(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.merchant_revoke_devices(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merchant_device_state(uuid, uuid) to service_role;
grant execute on function public.merchant_revoke_devices(uuid, uuid) to service_role;
