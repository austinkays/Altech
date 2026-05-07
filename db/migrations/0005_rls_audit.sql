-- 0005_rls_audit.sql
-- Phase D-1: self-checking audit that every public table holding user data
-- has RLS enabled and at least one policy attached. Catches the failure
-- mode where a future migration adds a table and forgets `enable row level
-- security` — this script will refuse to apply.
--
-- Idempotent and safe to run on a live database: it only does SELECT
-- queries inside a DO block and `raise exception` if expectations don't
-- match. Apply ordering: after 0004_kdf_metadata.sql.
--
-- The list of `expected_tables` below is the canonical inventory. When you
-- add a new public table, also add it here. If you intentionally exclude
-- a table from RLS (e.g., a public read-only reference table), add it to
-- `rls_exempt` instead — that decision should be explicit.

do $$
declare
    expected_tables text[] := array[
        'user_blobs',
        'user_quotes',
        'user_crypto_meta',
        'audit_log',
        -- Phase 2.5 (agency sharing — schema landed in 0003, app code TBD)
        'agencies',
        'agency_members',
        'agency_key_wraps',
        'agency_blobs'
    ];
    rls_exempt text[] := array[]::text[];
    t text;
    rls_enabled boolean;
    policy_count int;
    relkind char;
begin
    foreach t in array expected_tables loop
        select c.relrowsecurity, c.relkind
          into rls_enabled, relkind
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = t;

        if relkind is null then
            raise exception '[rls-audit] expected table public.% does not exist', t;
        elsif relkind <> 'r' then
            raise exception '[rls-audit] public.% is not an ordinary table (relkind=%) — adjust expectations', t, relkind;
        end if;

        if not rls_enabled then
            raise exception '[rls-audit] RLS is NOT enabled on public.% — add `alter table public.% enable row level security`', t, t;
        end if;

        select count(*)
          into policy_count
          from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = t;

        if policy_count = 0 then
            raise exception '[rls-audit] public.% has RLS enabled but ZERO policies — table is unreachable. Add at least one policy or move to rls_exempt explicitly.', t;
        end if;
    end loop;

    -- Catch any public table we forgot to inventory — every table in public
    -- schema should be either in expected_tables or rls_exempt.
    for t in
        select c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind = 'r'
           and c.relname not in (
               select unnest(expected_tables)
               union
               select unnest(rls_exempt)
           )
    loop
        raise exception '[rls-audit] public.% exists but is not in expected_tables[] or rls_exempt[] — add it to 0005_rls_audit.sql', t;
    end loop;

    raise notice '[rls-audit] OK — % public tables checked, all have RLS enabled with at least one policy.', array_length(expected_tables, 1);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit SECURITY DEFINER functions in the public schema. These bypass RLS
-- when called, so they must be:
--   - tightly scoped (read-only checks, no privileged writes), and
--   - explicitly granted only to the roles that need them (never PUBLIC).
-- The current inventory is just the two agency-membership helpers from 0003.
-- A new SECURITY DEFINER function shows up here → fail the audit until it's
-- added to the allowlist with a justification.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
    expected_secdef text[] := array[
        'is_agency_member',
        'is_agency_admin',
        -- Supabase platform-provided event trigger: auto-enables RLS on any
        -- newly created public table. Owner=postgres, defense-in-depth only —
        -- it cannot grant access, only restrict it. Keeping it in this list
        -- documents the dependency so future audits don't false-positive.
        'rls_auto_enable'
    ];
    f record;
    extras text[] := array[]::text[];
begin
    for f in
        select p.proname
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prosecdef = true
    loop
        if not (f.proname = any (expected_secdef)) then
            extras := array_append(extras, f.proname);
        end if;
    end loop;

    if array_length(extras, 1) > 0 then
        raise exception '[rls-audit] unexpected SECURITY DEFINER function(s) in public schema: % — add to expected_secdef[] in 0005 with a one-line justification.', extras;
    end if;

    raise notice '[rls-audit] SECURITY DEFINER inventory OK (% functions checked).', array_length(expected_secdef, 1);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sanity: confirm the agency helpers are not granted to PUBLIC. They were
-- explicitly revoke-then-grant'd in 0003; this re-asserts the state.
-- ─────────────────────────────────────────────────────────────────────────────
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
            raise exception '[rls-audit] function public.% is granted to PUBLIC — revoke and grant only to authenticated.', f;
        end if;
    end loop;
end $$;
