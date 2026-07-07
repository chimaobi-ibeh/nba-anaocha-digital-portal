-- ============================================================================
-- Move the branch receipt number (BIN) off dues/services onto Remuneration
-- ----------------------------------------------------------------------------
--  The auto-numbering was attached to the wrong thing. It is a *Remuneration*
--  Bar Identification Number for PREPARED DOCUMENTS — an interim register used
--  until the national Remuneration Portal is fully adopted. It must NOT apply
--  to dues or service applications.
--
--  This migration:
--    1. Removes BIN from dues_payments and service_applications (columns +
--       assignment triggers), while KEEPING their receipt-upload/verify flow.
--    2. Restores the two guard functions to versions with no bin references.
--    3. Creates public.remuneration_receipts — a standalone table where a
--       lawyer uploads a receipt for a prepared document, an admin verifies it,
--       and verification issues the next register number (NBA/ANAOCHA/0212/2026,
--       serial restarts each January).
--    4. Reuses the existing bin_counters + next_bin(), and resets 2026 to 211
--       so the first Remuneration number issued is 0212/2026.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Detach BIN from dues_payments
-- ─────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_x_assign_bin_dues on public.dues_payments;
drop function if exists public.assign_bin_on_dues_verification();

-- Restore the dues guard to its pre-BIN form (no bin handling).
create or replace function public.protect_dues_payment_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'direct') not in ('authenticated', 'anon') then
    return new;
  end if;

  if not public.is_admin() then
    if new.status not in ('pending', 'uploaded') then
      raise exception 'This payment status is set by the secretariat and cannot be self-assigned.';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

drop index if exists public.dues_payments_bin_key;
alter table public.dues_payments drop column if exists bin;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Detach BIN from service_applications
-- ─────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_x_assign_bin_service on public.service_applications;
drop function if exists public.assign_bin_on_service_verification();

-- Restore the service payment guard without bin handling (keeps the receipt
-- submit / re-upload / verify discipline).
create or replace function public.protect_service_application_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'direct') not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.payment_reviewed_by := null;
    new.payment_reviewed_at := null;
    new.payment_rejection_reason := null;
    if new.payment_status not in ('unpaid', 'uploaded', 'not_required') then
      raise exception 'This payment status is set by the secretariat and cannot be self-assigned.';
    end if;
    return new;
  end if;

  if not public.is_admin() then
    if new.status is distinct from old.status then
      raise exception 'Application status is set by the secretariat.';
    end if;
    if new.payment_status is distinct from old.payment_status
       and (new.payment_status <> 'uploaded'
            or old.payment_status not in ('unpaid', 'rejected', 'uploaded')) then
      raise exception 'This payment status is set by the secretariat and cannot be self-assigned.';
    end if;
    if old.payment_status = 'verified'
       and new.payment_receipt_url is distinct from old.payment_receipt_url then
      raise exception 'The receipt cannot be changed after verification.';
    end if;
    new.payment_reviewed_by := null;
    new.payment_reviewed_at := null;
    new.payment_rejection_reason := null;
  end if;

  return new;
end;
$$;

drop index if exists public.service_applications_bin_key;
alter table public.service_applications drop column if exists bin;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Reset the register so the first Remuneration number is 0212/2026
--    (any numbers consumed by mistaken dues/service verifications are void).
-- ─────────────────────────────────────────────────────────────────────────
insert into public.bin_counters (year, last_serial) values (2026, 211)
on conflict (year) do update set last_serial = 211;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Remuneration receipts (prepared documents)
-- ─────────────────────────────────────────────────────────────────────────
--  status: 'uploaded' -> awaiting review | 'verified' -> number issued
--          'rejected' -> not accepted, member may re-upload
create table if not exists public.remuneration_receipts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  description      text,                       -- optional: what document was prepared
  reference        text,                       -- optional: party / matter / extra info
  amount           numeric(15, 2),             -- amount paid (entered by the lawyer)
  receipt_url      text,                       -- storage path in the 'uploads' bucket
  status           text not null default 'uploaded',
  bin              text,                       -- register number, issued on verification
  reviewed_by      uuid references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now()
);

create unique index if not exists remuneration_receipts_bin_key on public.remuneration_receipts(bin);
create index if not exists remuneration_receipts_user_idx on public.remuneration_receipts(user_id);

alter table public.remuneration_receipts enable row level security;

drop policy if exists "Members read own remuneration" on public.remuneration_receipts;
create policy "Members read own remuneration"
  on public.remuneration_receipts for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members insert own remuneration" on public.remuneration_receipts;
create policy "Members insert own remuneration"
  on public.remuneration_receipts for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Members update own remuneration" on public.remuneration_receipts;
create policy "Members update own remuneration"
  on public.remuneration_receipts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Admins read all remuneration" on public.remuneration_receipts;
create policy "Admins read all remuneration"
  on public.remuneration_receipts for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins update all remuneration" on public.remuneration_receipts;
create policy "Admins update all remuneration"
  on public.remuneration_receipts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Guard: members submit/re-upload only; the secretariat decides; nobody writes
-- a register number from the website.
create or replace function public.protect_remuneration_receipt()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), 'direct') not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.bin := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;
    if new.status <> 'uploaded' then
      raise exception 'This status is set by the secretariat and cannot be self-assigned.';
    end if;
    return new;
  end if;

  new.bin := old.bin;

  if not public.is_admin() then
    -- Members may only (re)submit a receipt: -> 'uploaded', and never after it
    -- has been verified.
    if new.status is distinct from old.status
       and (new.status <> 'uploaded' or old.status not in ('uploaded', 'rejected')) then
      raise exception 'This status is set by the secretariat and cannot be self-assigned.';
    end if;
    if old.status = 'verified'
       and new.receipt_url is distinct from old.receipt_url then
      raise exception 'The receipt cannot be changed after verification.';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_a_protect_remuneration on public.remuneration_receipts;
create trigger trg_a_protect_remuneration
  before insert or update on public.remuneration_receipts
  for each row execute function public.protect_remuneration_receipt();

-- Issue the next register number when the secretariat verifies a receipt.
create or replace function public.assign_bin_on_remuneration_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'verified' and old.status is distinct from 'verified' and new.bin is null then
    new.bin := public.next_bin();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_x_assign_bin_remuneration on public.remuneration_receipts;
create trigger trg_x_assign_bin_remuneration
  before update on public.remuneration_receipts
  for each row execute function public.assign_bin_on_remuneration_verification();
