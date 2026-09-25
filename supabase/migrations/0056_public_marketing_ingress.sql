begin;

create table kxra.public_enquiry_submissions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 form_kind text not null check(form_kind in ('ENQUIRY','CUSTOM_PROJECT','CONTACT')),
 status text not null default 'UNVERIFIED' check(status in ('UNVERIFIED','REVIEWING','SPAM','CLOSED')),
 name text not null check(char_length(name) between 2 and 120),
 email text not null check(char_length(email) between 3 and 254),
 company text not null default '' check(char_length(company)<=160),
 message text not null check(char_length(message) between 20 and 4000),
 source_path text not null check(source_path in ('/partner','/submit-opportunity','/contact')),
 consent_recorded_at timestamptz not null,
 request_digest text not null check(request_digest~'^[a-f0-9]{64}$'),
 content_fingerprint text not null check(content_fingerprint~'^[a-f0-9]{64}$'),
 idempotency_key uuid not null,
 received_on date not null default current_date,
 received_at timestamptz not null default now(),
 unique(org_id,idempotency_key),
 unique(org_id,form_kind,content_fingerprint,received_on)
);

create table kxra.public_enquiry_rate_windows(
 org_id uuid not null references kxra.organisations(id),
 request_digest text not null check(request_digest~'^[a-f0-9]{64}$'),
 window_started timestamptz not null,
 request_count integer not null check(request_count between 1 and 5),
 updated_at timestamptz not null default now(),
 primary key(org_id,request_digest,window_started)
);

alter table kxra.public_enquiry_submissions enable row level security;
alter table kxra.public_enquiry_rate_windows enable row level security;

create policy public_enquiry_owner_read on kxra.public_enquiry_submissions
 for select to authenticated using(kxra_private.is_owner(org_id));
create policy public_enquiry_rate_owner_read on kxra.public_enquiry_rate_windows
 for select to authenticated using(kxra_private.is_owner(org_id));

revoke all on kxra.public_enquiry_submissions,kxra.public_enquiry_rate_windows from public,anon;
grant select on kxra.public_enquiry_submissions,kxra.public_enquiry_rate_windows to authenticated;

create function kxra.submit_public_enquiry(
 p_kind text,p_name text,p_email text,p_company text,p_message text,
 p_source_path text,p_consent boolean,p_request_digest text,
 p_content_fingerprint text,p_idempotency_key uuid,p_bot_field text default ''
) returns table(receipt_id uuid,accepted boolean,outcome text)
language plpgsql security definer set search_path='' as $$
declare
 o constant uuid:='10000000-0000-4000-8000-000000000001';
 bucket timestamptz:=date_trunc('hour',now());
 counter integer;
 result uuid;
begin
 if p_bot_field<>'' then
  return query select gen_random_uuid(),false,'DISCARDED';
  return;
 end if;
 if p_kind not in ('ENQUIRY','CUSTOM_PROJECT','CONTACT')
  or p_source_path not in ('/partner','/submit-opportunity','/contact')
  or not p_consent
  or char_length(trim(p_name)) not between 2 and 120
  or char_length(lower(trim(p_email))) not between 3 and 254
  or lower(trim(p_email))!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or char_length(trim(coalesce(p_company,'')))>160
  or char_length(trim(p_message)) not between 20 and 4000
  or p_request_digest!~'^[a-f0-9]{64}$'
  or p_content_fingerprint!~'^[a-f0-9]{64}$'
  or p_idempotency_key is null
 then raise exception 'Public ingress validation failed' using errcode='22023';end if;
 if not exists(select 1 from kxra.organisations where id=o) then
  raise exception 'Public ingress unavailable';end if;

 insert into kxra.public_enquiry_rate_windows(org_id,request_digest,window_started,request_count)
 values(o,p_request_digest,bucket,1)
 on conflict(org_id,request_digest,window_started) do update
 set request_count=kxra.public_enquiry_rate_windows.request_count+1,updated_at=now()
 where kxra.public_enquiry_rate_windows.request_count<5
 returning request_count into counter;
 if counter is null then raise exception 'Public ingress rate limit' using errcode='P0001';end if;

 select id into result from kxra.public_enquiry_submissions
 where org_id=o and (idempotency_key=p_idempotency_key or
  (form_kind=p_kind and content_fingerprint=p_content_fingerprint and received_on=current_date));
 if result is null then
  insert into kxra.public_enquiry_submissions(
   org_id,form_kind,name,email,company,message,source_path,consent_recorded_at,
   request_digest,content_fingerprint,idempotency_key
  ) values(o,p_kind,trim(p_name),lower(trim(p_email)),trim(coalesce(p_company,'')),
   trim(p_message),p_source_path,now(),p_request_digest,p_content_fingerprint,p_idempotency_key)
  returning id into result;
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  values(o,null,'public_enquiry.received',result,jsonb_build_object('form_kind',p_kind,'status','UNVERIFIED'));
 end if;
 return query select result,true,'ACCEPTED';
end $$;

revoke all on function kxra.submit_public_enquiry(text,text,text,text,text,text,boolean,text,text,uuid,text) from public;
grant execute on function kxra.submit_public_enquiry(text,text,text,text,text,text,boolean,text,text,uuid,text) to anon,authenticated;

commit;
