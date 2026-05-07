-- 0006_harden_function_grants.sql
-- Phase D-2: lock down REST-callable SECURITY DEFINER helpers + pin
-- search_path on regular trigger functions.
--
-- Background: Supabase's database linter flagged four functions (advisor
-- warnings 0011 / 0028 / 0029) after 0004 + 0005 landed:
--
--   1. is_agency_admin / is_agency_member (added in 0003)
--      SECURITY DEFINER helpers used INSIDE RLS policies. They were created
--      with default-public EXECUTE grants, which means anon and authenticated
--      can also call them via /rest/v1/rpc/<name>. No data leaks (return
--      boolean), but unnecessary attack surface — an unauthenticated visitor
--      could probe agency membership pre-login.
--
--   2. rls_auto_enable (Supabase platform event trigger, owner=postgres)
--      Defense-in-depth event trigger that auto-enables RLS on any newly
--      created public table. RPC invocation is meaningless (event triggers
--      fire from DDL, not RPC), so the grant is just noise.
--
--   3. tg_set_updated_at (your trigger function)
--      Not SECURITY DEFINER, but search_path is unset → linter flag 0011
--      (function_search_path_mutable). Best practice: pin search_path so
--      the function's behavior can't be hijacked by a caller's search_path.
--
-- Why this is safe:
--   - SECURITY DEFINER functions execute as the OWNER (postgres). The EXECUTE
--     grant on anon/authenticated only controls whether those roles can
--     CALL the function via REST. RLS policies invoke the function through
--     the policy machinery, not via REST grants — so policies keep working
--     after the revoke.
--   - service_role keeps EXECUTE so server-side code can still introspect
--     agency membership when needed.
--
-- Apply order: after 0005_rls_audit.sql.

-- ── 1. Revoke REST EXECUTE from anon + authenticated on the agency helpers
-- (keep service_role + postgres).
revoke execute on function public.is_agency_admin(uuid, uuid)
    from public, anon, authenticated;
revoke execute on function public.is_agency_member(uuid, uuid)
    from public, anon, authenticated;

-- ── 2. Revoke EXECUTE from everyone except postgres on the platform event
-- trigger. Event triggers fire from DDL, never from RPC, so no role
-- legitimately needs EXECUTE here.
revoke execute on function public.rls_auto_enable()
    from public, anon, authenticated, service_role;

-- ── 3. Pin search_path on the regular trigger function. Mutable search_path
-- on a function that runs in trigger context is a hijack vector — set it
-- explicitly to a safe inventory.
alter function public.tg_set_updated_at()
    set search_path = pg_catalog, public;

-- ── 4. Re-confirm the audit invariants from 0005 still hold after the
-- revokes. RLS policies should still find the helpers; the helpers are
-- still listed in expected_secdef[] and not granted to PUBLIC.
do $$
declare
    f text;
    has_public_grant boolean;
begin
    for f in select unnest(array['is_agency_member', 'is_agency_admin']) loop
        select bool_or(grantee = 'PUBLIC')
          into has_public_grant
          from information_schema.routine_privileges
         where routine_schema = 'public'
           and routine_name   = f;

        if has_public_grant then
            raise exception '[harden] post-revoke check: function public.% still granted to PUBLIC', f;
        end if;
    end loop;

    raise notice '[harden] OK -- agency helpers no longer granted to PUBLIC.';
end $$;
