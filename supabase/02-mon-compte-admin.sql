-- =====================================================================
-- À lancer APRÈS avoir créé ton utilisateur dans Supabase > Authentication > Users.
-- Remplace l'email par le tien (garde les apostrophes), puis clique sur Run.
-- =====================================================================
insert into public.admins (user_id)
select id from auth.users where email = 'ton.email@exemple.com';
