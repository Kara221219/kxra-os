begin;

-- Keep the established Data API contract: anonymous callers may reach these
-- relations, while RLS returns no rows. Inserts and every other table action
-- remain unavailable; the bounded RPC is the only write path.
grant select on kxra.public_enquiry_submissions,kxra.public_enquiry_rate_windows to anon;

commit;
