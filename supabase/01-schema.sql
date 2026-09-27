-- =====================================================================
-- CARTE FIDÉLITÉ : script complet de la base de données
-- À coller EN ENTIER dans Supabase > SQL Editor > New query > Run
-- (À lancer une seule fois, sur un projet vide.)
-- =====================================================================

-- 0. Outils (chiffrement des codes PIN, génération de codes aléatoires)
create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- 1. ADMINS : les personnes autorisées à entrer dans le tableau de bord (toi)
-- =====================================================================
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- =====================================================================
-- 2. ENTREPRISES (tes clients)
-- =====================================================================
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,                       -- ex : boulangerie-du-bourg (utilisé dans les liens)
  logo_url text,
  address text,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  max_notifications_per_week integer not null default 2 check (max_notifications_per_week between 0 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- 3. PROGRAMMES DE FIDÉLITÉ (le design et la règle de la carte)
-- =====================================================================
create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,  -- 1 carte par entreprise
  name text not null,                                  -- ex : "Carte Gourmande"
  reward_threshold integer not null check (reward_threshold between 2 and 50),  -- ex : 10 tampons
  reward_description text not null,                    -- ex : "1 pain au chocolat offert"
  background_color text not null default '#0B6474',
  foreground_color text not null default '#FFFFFF',
  label_color text not null default '#CDE7EA',
  back_text text,                                      -- texte au dos de la carte
  max_stamps_per_day integer not null default 1 check (max_stamps_per_day between 1 and 10),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- 4. CLIENTS FINAUX (les clients de tes entreprises)
-- =====================================================================
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  birth_date date,                                     -- facultatif (offre anniversaire)
  marketing_optin boolean not null default false,      -- accepte les notifications promo ?
  created_at timestamptz not null default now(),
  last_visit_at timestamptz,
  constraint customers_contact_required check (email is not null or phone is not null)
);
create unique index customers_unique_email on public.customers (business_id, lower(email)) where email is not null;
create unique index customers_unique_phone on public.customers (business_id, phone) where phone is not null;

-- =====================================================================
-- 5. CARTES (la carte dans le Wallet d'un client)
-- =====================================================================
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  serial_number uuid not null unique default gen_random_uuid(),                            -- contenu du QR code
  auth_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),       -- secret Apple Wallet
  web_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'), -- lien de la carte web
  stamps_count integer not null default 0 check (stamps_count >= 0),
  rewards_earned integer not null default 0,
  rewards_redeemed integer not null default 0,
  last_message text,                                   -- dernière notification affichée sur la carte
  wallet_platform text check (wallet_platform in ('apple', 'google', 'web')),
  google_saved boolean not null default false,
  winback_sent_at timestamptz,                         -- "Tu nous manques" déjà envoyé ?
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, program_id)
);

-- =====================================================================
-- 6. ACCÈS COMMERÇANT (lien + code PIN : scanner, notifications, clients)
-- =====================================================================
create table public.scanner_access (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null default 'Accès principal',
  access_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  pin_hash text not null,                              -- PIN chiffré, jamais en clair
  can_send_notifications boolean not null default true,
  is_active boolean not null default true,
  failed_attempts integer not null default 0,          -- bloqué après 5 erreurs
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 7. HISTORIQUE DES TAMPONS
-- =====================================================================
create table public.stamp_events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  scanner_id uuid references public.scanner_access(id) on delete set null,
  event_type text not null check (event_type in ('stamp', 'reward_redeemed', 'correction')),
  delta integer not null,
  undone_at timestamptz,                               -- tampon annulé ?
  note text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 8. CONSENTEMENTS (preuve RGPD, on garde l'historique)
-- =====================================================================
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  consent_type text not null check (consent_type in ('privacy_policy', 'marketing_notifications')),
  granted boolean not null,
  policy_version text,
  source text not null default 'inscription',
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 9. NOTIFICATIONS (envoi immédiat, programmé ou répété)
-- =====================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 180),
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'cancelled', 'failed', 'skipped')),
  send_at timestamptz not null default now(),
  repeat_every_days integer check (repeat_every_days is null or repeat_every_days >= 3),
  repeat_until timestamptz,
  created_by text not null default 'merchant' check (created_by in ('admin', 'merchant')),
  sent_at timestamptz,
  recipients_count integer,
  error text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 10. IPHONES ENREGISTRÉS (Apple en a besoin pour mettre à jour les cartes)
-- =====================================================================
create table public.apple_device_registrations (
  id uuid primary key default gen_random_uuid(),
  device_library_id text not null,
  push_token text not null,
  card_id uuid not null references public.cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (device_library_id, card_id)
);

-- =====================================================================
-- 11. Index (pour que ce soit rapide)
-- =====================================================================
create index on public.customers (business_id);
create index on public.cards (customer_id);
create index on public.cards (program_id);
create index on public.scanner_access (business_id);
create index on public.stamp_events (card_id, created_at);
create index on public.stamp_events (business_id, created_at);
create index on public.consents (customer_id);
create index on public.notifications (status, send_at);
create index on public.notifications (business_id, send_at);
create index on public.apple_device_registrations (card_id);
create index on public.apple_device_registrations (device_library_id);

-- =====================================================================
-- 12. Mise à jour automatique de "updated_at"
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger trg_businesses_updated before update on public.businesses for each row execute function public.set_updated_at();
create trigger trg_programs_updated before update on public.loyalty_programs for each row execute function public.set_updated_at();
create trigger trg_cards_updated before update on public.cards for each row execute function public.set_updated_at();

-- =====================================================================
-- 13. SÉCURITÉ RLS : tout est fermé à clé, sauf pour l'admin connecté.
-- Les pages publiques (inscription client, espace commerçant, Wallet)
-- passent par le serveur de l'application, qui vérifie tout.
-- =====================================================================
alter table public.admins enable row level security;
create policy "Admin: voir sa propre ligne" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array[
    'businesses', 'loyalty_programs', 'customers', 'cards', 'scanner_access',
    'stamp_events', 'consents', 'notifications', 'apple_device_registrations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Admin: accès complet" on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end $$;

-- =====================================================================
-- 14. FONCTIONS MÉTIER
-- =====================================================================

-- 14a. Créer un accès commerçant avec un PIN chiffré (réservé à l'admin)
create or replace function public.create_scanner_access(
  p_business_id uuid, p_pin text, p_label text default 'Accès principal'
)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_token text;
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'Le PIN doit contenir entre 4 et 8 chiffres'; end if;
  insert into public.scanner_access (business_id, label, pin_hash)
  values (p_business_id, p_label, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  returning access_token into v_token;
  return v_token;
end;
$$;

-- 14b. Vérifier le PIN d'un commerçant (bloque après 5 erreurs)
create or replace function public.verify_merchant_pin(p_token text, p_pin text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_access public.scanner_access; v_status text;
begin
  select * into v_access from public.scanner_access where access_token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Lien invalide.'); end if;
  if not v_access.is_active then return jsonb_build_object('ok', false, 'error', 'Cet accès est désactivé.'); end if;
  if v_access.failed_attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Accès bloqué après 5 erreurs. Contacte ton prestataire.');
  end if;
  select status into v_status from public.businesses where id = v_access.business_id;
  if v_status <> 'active' then return jsonb_build_object('ok', false, 'error', 'Ce compte est suspendu.'); end if;

  if v_access.pin_hash = extensions.crypt(p_pin, v_access.pin_hash) then
    update public.scanner_access set failed_attempts = 0, last_used_at = now() where id = v_access.id;
    return jsonb_build_object('ok', true, 'scanner_id', v_access.id, 'business_id', v_access.business_id);
  end if;

  update public.scanner_access set failed_attempts = failed_attempts + 1 where id = v_access.id;
  return jsonb_build_object('ok', false, 'error',
    'Code PIN incorrect. Il te reste ' || (4 - v_access.failed_attempts) || ' essai(s).');
end;
$$;

-- 14c. Ajouter un tampon (avec toutes les sécurités anti-triche)
create or replace function public.add_stamp(p_serial uuid, p_scanner_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_access public.scanner_access;
  v_card public.cards;
  v_prog public.loyalty_programs;
  v_first_name text;
  v_today integer;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'America/Guadeloupe')) at time zone 'America/Guadeloupe';
begin
  select * into v_access from public.scanner_access where id = p_scanner_id and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'Accès commerçant désactivé.'); end if;

  select * into v_card from public.cards where serial_number = p_serial for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Carte inconnue.'); end if;

  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if v_prog.business_id <> v_access.business_id then
    return jsonb_build_object('ok', false, 'error', 'Cette carte appartient à un autre commerce.');
  end if;
  if not v_prog.is_active then return jsonb_build_object('ok', false, 'error', 'Le programme de fidélité est désactivé.'); end if;

  select first_name into v_first_name from public.customers where id = v_card.customer_id;

  if v_card.stamps_count >= v_prog.reward_threshold then
    return jsonb_build_object('ok', false, 'reward_ready', true, 'first_name', v_first_name,
      'stamps', v_card.stamps_count, 'threshold', v_prog.reward_threshold,
      'error', 'Le cadeau est déjà débloqué : valide-le d''abord.');
  end if;

  select count(*) into v_today from public.stamp_events
    where card_id = v_card.id and event_type = 'stamp' and undone_at is null and created_at >= v_day_start;
  if v_today >= v_prog.max_stamps_per_day then
    return jsonb_build_object('ok', false, 'first_name', v_first_name,
      'stamps', v_card.stamps_count, 'threshold', v_prog.reward_threshold,
      'error', 'Limite atteinte : ' || v_prog.max_stamps_per_day || ' tampon(s) par jour pour ce client.');
  end if;

  update public.cards
    set stamps_count = stamps_count + 1,
        rewards_earned = rewards_earned + case when stamps_count + 1 = v_prog.reward_threshold then 1 else 0 end,
        winback_sent_at = null
    where id = v_card.id
    returning * into v_card;

  update public.customers set last_visit_at = now() where id = v_card.customer_id;
  update public.scanner_access set last_used_at = now() where id = v_access.id;
  insert into public.stamp_events (card_id, business_id, scanner_id, event_type, delta)
    values (v_card.id, v_access.business_id, v_access.id, 'stamp', 1);

  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'first_name', v_first_name,
    'stamps', v_card.stamps_count, 'threshold', v_prog.reward_threshold,
    'reward_ready', v_card.stamps_count >= v_prog.reward_threshold);
end;
$$;

-- 14d. Valider le cadeau (remet le compteur à zéro)
create or replace function public.redeem_reward(p_serial uuid, p_scanner_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_access public.scanner_access; v_card public.cards; v_prog public.loyalty_programs;
begin
  select * into v_access from public.scanner_access where id = p_scanner_id and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'Accès commerçant désactivé.'); end if;
  select * into v_card from public.cards where serial_number = p_serial for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Carte inconnue.'); end if;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if v_prog.business_id <> v_access.business_id then
    return jsonb_build_object('ok', false, 'error', 'Cette carte appartient à un autre commerce.');
  end if;
  if v_card.stamps_count < v_prog.reward_threshold then
    return jsonb_build_object('ok', false, 'error', 'Le cadeau n''est pas encore débloqué.');
  end if;

  update public.cards
    set stamps_count = stamps_count - v_prog.reward_threshold, rewards_redeemed = rewards_redeemed + 1
    where id = v_card.id returning * into v_card;
  insert into public.stamp_events (card_id, business_id, scanner_id, event_type, delta)
    values (v_card.id, v_access.business_id, v_access.id, 'reward_redeemed', -v_prog.reward_threshold);

  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'stamps', v_card.stamps_count, 'threshold', v_prog.reward_threshold);
end;
$$;

-- 14e. Annuler le dernier tampon (possible pendant 10 minutes)
create or replace function public.undo_last_stamp(p_serial uuid, p_scanner_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_card public.cards; v_prog public.loyalty_programs; v_event public.stamp_events;
begin
  select * into v_card from public.cards where serial_number = p_serial for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Carte inconnue.'); end if;
  select * into v_prog from public.loyalty_programs where id = v_card.program_id;

  select * into v_event from public.stamp_events
    where card_id = v_card.id and scanner_id = p_scanner_id and event_type = 'stamp'
      and undone_at is null and created_at > now() - interval '10 minutes'
    order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'Aucun tampon récent à annuler.'); end if;

  update public.stamp_events set undone_at = now() where id = v_event.id;
  update public.cards
    set rewards_earned = rewards_earned - case when stamps_count = v_prog.reward_threshold then 1 else 0 end,
        stamps_count = greatest(0, stamps_count - 1)
    where id = v_card.id returning * into v_card;

  return jsonb_build_object('ok', true, 'card_id', v_card.id, 'stamps', v_card.stamps_count, 'threshold', v_prog.reward_threshold);
end;
$$;

-- Ces fonctions ne sont appelables QUE par le serveur de l'application (clé secrète)
revoke execute on function public.verify_merchant_pin(text, text) from public, anon, authenticated;
revoke execute on function public.add_stamp(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.redeem_reward(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.undo_last_stamp(uuid, uuid) from public, anon, authenticated;
grant execute on function public.verify_merchant_pin(text, text) to service_role;
grant execute on function public.add_stamp(uuid, uuid) to service_role;
grant execute on function public.redeem_reward(uuid, uuid) to service_role;
grant execute on function public.undo_last_stamp(uuid, uuid) to service_role;
revoke execute on function public.create_scanner_access(uuid, text, text) from public, anon;

-- =====================================================================
-- 15. STOCKAGE DES LOGOS (dossier public "logos")
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
