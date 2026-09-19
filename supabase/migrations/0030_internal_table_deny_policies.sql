begin;

-- These tables are reachable only through bounded security-definer RPCs.
-- Named false policies preserve the existing deny-all behavior and make that
-- boundary visible to schema audits.
create policy inbound_events_deny_direct on kxra.inbound_events
for all to public using(false) with check(false);

create policy request_rate_limits_deny_direct on kxra.request_rate_limits
for all to public using(false) with check(false);

commit;
