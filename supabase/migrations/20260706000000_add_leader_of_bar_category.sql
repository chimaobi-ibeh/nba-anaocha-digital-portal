-- ============================================================================
-- Add a 'leader_of_bar' category to public.people
-- ----------------------------------------------------------------------------
--  Lets the branch feature the Leader of the Bar / 1st Senior Advocate of
--  Nigeria (SAN) of the Branch beside the Grand Patron on the landing page.
-- ============================================================================

alter table public.people drop constraint if exists people_category_check;

alter table public.people
  add constraint people_category_check
  check (category in ('executive', 'committee', 'patron', 'leader_of_bar'));
