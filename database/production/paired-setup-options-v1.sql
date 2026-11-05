-- Unnumbered request-only selector catalog after paired-setup-policy-v1. No device grants or credentials are issued.
begin;
create function kxra_paired_admission.setup_options() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();u uuid=auth.uid();sv integer;mv integer;
begin
 select a.session_version,m.version into sv,mv from kxra.account_identities a join kxra.organisation_memberships m on m.account_id=a.account_id where a.account_id=u and m.org_id=o;
 if session_user<>'kxra_app' or not exists(select 1 from kxra.team_rooms room where room.org_id=o and kxra_paired_admission.setup_human(o,u,room.id,sv,mv)) then raise insufficient_privilege;end if;
 return jsonb_build_object('rooms',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name,r.id) from(select * from kxra.team_rooms where org_id=o and kxra_paired_admission.setup_human(o,u,id,sv,mv) order by name,id limit 50)r),'[]'::jsonb),
 'ai_intents',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'model',t.model) order by t.created_at desc,t.id) from(select * from kxra_private.ai_connection_intents where org_id=o and actor_id=u and session_version=sv and provider='OPENAI' and expires_at>clock_timestamp() order by created_at desc,id limit 20)t),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'agent_id',s.agent_id,'room_id',s.room_id,'label',s.label) order by s.created_at desc,s.id) from(select * from kxra_paired_admission.setup_requests where org_id=o and account_id=u and session_version=sv and membership_version=mv order by created_at desc,id limit 20)s where kxra_paired_admission.setup_human(o,u,s.room_id,sv,mv)),'[]'::jsonb));
end $$;
revoke all on function kxra_paired_admission.setup_options() from public,anon,authenticated,kxra_app;
grant execute on function kxra_paired_admission.setup_options() to authenticated;
commit;
