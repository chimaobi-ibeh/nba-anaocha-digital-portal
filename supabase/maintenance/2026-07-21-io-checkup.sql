-- Disk IO investigation follow-up (2026-07-21).
-- Context: Disk IO consumed/day was flat 14-18 Jul, spiked 19-21 Jul —
-- matching our deploy/migration/testing window, not user growth.
-- Run each block in the Supabase SQL Editor (dashboard) on the prod project.

-- ============================================================
-- STEP 1 (read-only): how old is the stats window?
-- If stats_reset is recent (days), the churn counts are concentrated
-- and the "dev activity" explanation is even stronger.
-- ============================================================
select stats_reset from pg_stat_statements_info;

-- ============================================================
-- STEP 2 (read-only): snapshot of dead tuples before cleanup,
-- so we can see what the vacuum actually did.
-- ============================================================
select schemaname, relname, n_live_tup, n_dead_tup, last_autovacuum
from pg_stat_user_tables
where n_dead_tup > 0
order by n_dead_tup desc;

-- ============================================================
-- STEP 3 (writes, but safe): clear the seed/test residue.
-- VACUUM ANALYZE reclaims dead tuples and refreshes planner stats.
-- It does not lock out reads/writes. Fine to run during the day
-- at this data size (~3 MB total).
--
-- IMPORTANT: the SQL Editor wraps batched runs in one transaction and
-- VACUUM cannot run inside a transaction ("ERROR 25001"). What works
-- (verified 2026-07-21): paste ONE line at a time into an empty query
-- tab and run it alone. Do these six in any order.
-- ============================================================
vacuum (analyze) auth.users;
vacuum (analyze) auth.sessions;
vacuum (analyze) auth.refresh_tokens;
vacuum (analyze) public.profiles;
vacuum (analyze) public.notifications;
vacuum (analyze) storage.objects;

-- ============================================================
-- NOT doing (deliberately):
--  * Dropping "unused" indexes — stats window too short to trust
--    idx_scan = 0, and profiles_lbian_key is a uniqueness guarantee.
--  * audit_logs indexes — 157 rows; add when the table has volume
--    (and note: CREATE INDEX CONCURRENTLY must run outside a
--    transaction, so via SQL editor, not a migration).
--  * Compute upgrade — CPU <25%, memory at normal baseline, zero
--    read pressure. Re-evaluate only if IO stays high in a week
--    with no deploys.
-- ============================================================
