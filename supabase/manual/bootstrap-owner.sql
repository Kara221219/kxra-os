-- RETIRED: this file targeted the legacy identity model and is intentionally
-- non-executable. Use npm run staging:owner:{plan,apply,verify}; that guarded
-- operator verifies Supabase Auth confirmation/MFA and writes both identity
-- representations atomically.
do $$ begin
 raise exception 'RETIRED_OWNER_BOOTSTRAP_USE_GUARDED_OPERATOR';
end $$;
