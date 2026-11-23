-- Entrée Walty (depuis le CRM) : les actions à la main marchent aussi quand le gérant du commerce n'a pas encore changé son
-- mot de passe provisoire. p_walty_admin n'est envoyé que par le serveur, après vérification de la preuve signée ;
-- ces fonctions restent interdites à anon et authenticated.
begin;
do $migration$
declare
  d text;
begin
  d := pg_get_functiondef('public.merchant_manual_action(uuid,uuid,text,numeric,uuid,boolean,text)'::regprocedure);
  d := replace(d, 'p_reason text DEFAULT NULL::text)', 'p_reason text DEFAULT NULL::text, p_walty_admin boolean DEFAULT false)');
  d := replace(d, 'if not exists (select 1 from public.merchant_logins m where m.scanner_access_id = p_scanner_id and not m.must_change_password) then',
                  'if not coalesce(p_walty_admin, false) and not exists (select 1 from public.merchant_logins m where m.scanner_access_id = p_scanner_id and not m.must_change_password) then');
  if d not like '%p_walty_admin boolean%' or d not like '%if not coalesce(p_walty_admin%' then raise exception 'merchant_manual_action : remplacement impossible'; end if;
  drop function public.merchant_manual_action(uuid, uuid, text, numeric, uuid, boolean, text);
  execute d;

  d := pg_get_functiondef('public.merchant_remove_stamp(uuid,uuid,text)'::regprocedure);
  d := replace(d, 'p_reason text)', 'p_reason text, p_walty_admin boolean DEFAULT false)');
  d := replace(d, 'if not exists (select 1 from public.merchant_logins m where m.scanner_access_id = p_scanner and not m.must_change_password) then',
                  'if not coalesce(p_walty_admin, false) and not exists (select 1 from public.merchant_logins m where m.scanner_access_id = p_scanner and not m.must_change_password) then');
  if d not like '%p_walty_admin boolean%' or d not like '%if not coalesce(p_walty_admin%' then raise exception 'merchant_remove_stamp : remplacement impossible'; end if;
  drop function public.merchant_remove_stamp(uuid, uuid, text);
  execute d;
end
$migration$;
revoke all on function public.merchant_manual_action(uuid, uuid, text, numeric, uuid, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.merchant_remove_stamp(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.merchant_manual_action(uuid, uuid, text, numeric, uuid, boolean, text, boolean) to service_role;
grant execute on function public.merchant_remove_stamp(uuid, uuid, text, boolean) to service_role;
commit;
