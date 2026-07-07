-- ============================================================================
-- Drop the announcements feature
-- ----------------------------------------------------------------------------
--  The Send Notification flow (in-app + optional email broadcast) fully covers
--  what announcements did, so the client asked to scrap it. The UI was removed
--  in the same release; this drops the now-unused table and its policies.
-- ============================================================================

drop table if exists public.announcements cascade;
