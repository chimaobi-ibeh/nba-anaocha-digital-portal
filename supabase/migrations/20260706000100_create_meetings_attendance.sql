-- ============================================================================
-- Branch meetings & attendance register
-- ----------------------------------------------------------------------------
--  Admins create each month's meetings (physical or virtual) and mark members
--  present. Members see the meeting list, their own Present/Absent record and
--  their attendance rate on the portal. Absence is implicit: a member with no
--  attendance row for a meeting was absent.
-- ============================================================================

create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  meeting_date date not null,
  mode         text not null default 'physical' check (mode in ('physical', 'virtual')),
  venue        text,                        -- address for physical, link/platform for virtual
  notes        text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

create table if not exists public.meeting_attendance (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id    uuid not null,
  marked_by  uuid,
  created_at timestamptz not null default now(),
  unique (meeting_id, user_id)
);

create index if not exists idx_meeting_attendance_user    on public.meeting_attendance(user_id);
create index if not exists idx_meeting_attendance_meeting on public.meeting_attendance(meeting_id);

alter table public.meetings           enable row level security;
alter table public.meeting_attendance enable row level security;

-- Members see the meeting calendar (needed to show Absent for missed meetings).
create policy "Members view meetings"
  on public.meetings for select
  to authenticated
  using (true);

create policy "Admins manage meetings"
  on public.meetings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Members read only their own attendance rows.
create policy "Members view own attendance"
  on public.meeting_attendance for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins manage attendance"
  on public.meeting_attendance for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
