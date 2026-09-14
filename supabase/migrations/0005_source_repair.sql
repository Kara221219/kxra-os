begin;
-- Reviewed source repair. Never overwrite a modified directive.
alter table kxra.records disable trigger records_guard;
do $$ begin
 if exists(select 1 from kxra.records where source_code='DEC-001' and data is distinct from '{"id": "DEC-001", "classification": "DECISION", "title": "Five-project scope", "authority": "owner_directive", "state": "accepted", "decision": "Seed all five workspaces", "rationale": "Current Genesis request", "decider": "Owner", "decided_at": "2026-09-11", "supersedes": null}'::jsonb) then raise exception 'Modified directive requires manual reconciliation: DEC-001';end if;
end $$;
update kxra.records set status='accepted',version=version+1,updated_at=now() where source_code='DEC-001' and status='draft';
do $$ begin
 if exists(select 1 from kxra.records where source_code='DEC-002' and data is distinct from '{"id": "DEC-002", "classification": "DECISION", "title": "Project 004 paper only", "authority": "owner_directive", "state": "accepted", "decision": "No live trading tools or production broker credentials", "rationale": "Current request and SRC-004", "decider": "Owner", "decided_at": "2026-09-11", "supersedes": null}'::jsonb) then raise exception 'Modified directive requires manual reconciliation: DEC-002';end if;
end $$;
update kxra.records set status='accepted',version=version+1,updated_at=now() where source_code='DEC-002' and status='draft';
do $$ begin
 if exists(select 1 from kxra.records where source_code='DEC-003' and data is distinct from '{"id": "DEC-003", "classification": "DECISION", "title": "Project 005 demand before production", "authority": "owner_directive", "state": "accepted", "decision": "Gate product creation on demand evidence", "rationale": "Current request and SRC-005", "decider": "Owner", "decided_at": "2026-09-11", "supersedes": null}'::jsonb) then raise exception 'Modified directive requires manual reconciliation: DEC-003';end if;
end $$;
update kxra.records set status='accepted',version=version+1,updated_at=now() where source_code='DEC-003' and status='draft';
do $$ begin
 if exists(select 1 from kxra.records where source_code='DEC-004' and data is distinct from '{"id": "DEC-004", "classification": "DECISION", "title": "Retain requested stack", "authority": "owner_directive", "state": "accepted", "decision": "Vercel/Supabase/Trigger/Resend/PostHog/Sentry/Cloudflare/GitHub", "rationale": "Current request; no serious replacement reason identified", "decider": "Owner", "decided_at": "2026-09-11", "supersedes": null}'::jsonb) then raise exception 'Modified directive requires manual reconciliation: DEC-004';end if;
end $$;
update kxra.records set status='accepted',version=version+1,updated_at=now() where source_code='DEC-004' and status='draft';
do $$ begin
 if exists(select 1 from kxra.records where source_code='DEC-005' and data is distinct from '{"id": "DEC-005", "classification": "DECISION", "title": "Authorisation before retrieval", "authority": "owner_directive", "state": "accepted", "decision": "Deterministic policy and RLS precede AI context loading", "rationale": "Current request", "decider": "Owner", "decided_at": "2026-09-11", "supersedes": null}'::jsonb) then raise exception 'Modified directive requires manual reconciliation: DEC-005';end if;
end $$;
update kxra.records set status='accepted',version=version+1,updated_at=now() where source_code='DEC-005' and status='draft';
-- Establish provenance on existing imported rows without inventing their creator.
update kxra.records set provenance=jsonb_build_object('source_code',source_code,'source_version',1,'source_hash',encode(sha256(convert_to((case when source_code like 'PROJECT-%-BRIEF' then jsonb_build_object('next_action',body) else data end)::text,'UTF8')),'hex'),'authority',coalesce(data->>'authority','source_definition'),'importer','genesis-v2'),version=version+1,updated_at=now()
where source_code is not null and provenance='{}'::jsonb;
alter table kxra.records enable trigger records_guard;
commit;
