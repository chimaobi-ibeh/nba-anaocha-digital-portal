-- ============================================================================
-- Bank-transfer payments + branch receipt numbers (BIN)
-- ----------------------------------------------------------------------------
--  Paystack is scrapped (the branch cannot open a Paystack business account
--  without a CAC document). All payments are now made by bank transfer to the
--  branch account; the member uploads the transfer receipt and the secretariat
--  reviews it. When a receipt is approved, the portal issues the next number
--  in the branch's manual receipt register:
--
--      NBA/ANAOCHA/0212/2026   (last manually issued: 0211/2026)
--
--  * One register across dues AND service payments; serial restarts at 0001
--    each January (Africa/Lagos time).
--  * Upload-only dues items (BPF etc.) are paid to NBA national, not the
--    branch account, so verifying them does NOT consume a register number.
--  * BIN is system-issued on approval — never client-writable, and rejected
--    receipts never consume a number.
--  * The old Paystack ledger (public.payments) and references are dropped;
--    the client confirmed there are no real past payments to preserve.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Remove the Paystack ledger and references
-- ─────────────────────────────────────────────────────────────────────────
drop table if exists public.payments cascade;

delete from public.dues_payments where status = 'paid';
drop index if exists public.dues_payments_reference_key;
alter table public.dues_payments drop column if exists reference;

alter table public.service_applications drop column if exists payment_reference;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Receipt-review columns
-- ─────────────────────────────────────────────────────────────────────────
-- service_applications.payment_status values:
--   'unpaid'       -> submitted without a receipt (legacy default)
--   'uploaded'     -> transfer receipt attached, awaiting secretariat review
--   'verified'     -> secretariat confirmed the transfer (BIN issued)
--   'rejected'     -> receipt not accepted; member may re-upload
--   'not_required' -> free service
alter table public.service_applications
  add column if not exists payment_receipt_url      text,
  add column if not exists payment_amount           numeric(15, 2),
  add column if not exists payment_reviewed_by      uuid references auth.users(id) on delete set null,
  add column if not exists payment_reviewed_at      timestamptz,
  add column if not exists payment_rejection_reason text,
  add column if not exists bin                      text;

alter table public.dues_payments
  add column if not exists bin text;

create unique index if not exists service_applications_bin_key on public.service_applications(bin);
create unique index if not exists dues_payments_bin_key        on public.dues_payments(bin);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. The receipt register: per-year counter + number generator
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.bin_counters (
  year        int primary key,
  last_serial int not null
);

-- Continue from the branch's manual register: last issued was 0211/2026.
insert into public.bin_counters (year, last_serial)
values (2026, 211)
on conflict (year) do nothing;

-- Only the assignment triggers may touch the counter.
alter table public.bin_counters enable row level security;

create or replace function public.next_bin()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from (now() at time zone 'Africa/Lagos'))::int;
  s int;
begin
  -- Atomic: first receipt of a new year seeds the row at 1; otherwise the
  -- row lock taken by the upsert serialises concurrent approvals.
  insert into bin_counters (year, last_serial) values (y, 1)
  on conflict (year) do update set last_serial = bin_counters.last_serial + 1
  returning last_serial into s;

  return 'NBA/ANAOCHA/' || lpad(s::text, greatest(4, length(s::text)), '0') || '/' || y;
end;
$$;

revoke execute on function public.next_bin() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Issue a BIN when the secretariat approves a payment
--    (BEFORE UPDATE; named trg_x_* so the trg_* / trg_a_* guards run first)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.assign_bin_on_dues_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  upload_only boolean;
begin
  if new.status = 'verified' and old.status is distinct from 'verified' and new.bin is null then
    -- Upload-only items (BPF etc.) are paid to NBA national, not the branch
    -- account — they count for compliance but don't enter the receipt register.
    select requires_upload into upload_only from dues_items where id = new.dues_item_id;
    if not coalesce(upload_only, false) then
      new.bin := public.next_bin();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_x_assign_bin_dues on public.dues_payments;
create trigger trg_x_assign_bin_dues
  before update on public.dues_payments
  for each row execute function public.assign_bin_on_dues_verification();

create or replace function public.assign_bin_on_service_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'verified' and old.payment_status is distinct from 'verified' and new.bin is null then
    new.bin := public.next_bin();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_x_assign_bin_service on public.service_applications;
create trigger trg_x_assign_bin_service
  before update on public.service_applications
  for each row execute function public.assign_bin_on_service_verification();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Guards: members submit, the secretariat decides, nobody writes BINs
-- ─────────────────────────────────────────────────────────────────────────
-- dues_payments: extend the existing guard so BIN is never client-writable.
create or replace function public.protect_dues_payment_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Trust service_role / direct DB connections. Only anon/authenticated
  -- website requests are guarded.
  if coalesce(auth.role(), 'direct') not in ('authenticated', 'anon') then
    return new;
  end if;

  -- BIN is issued by the register trigger, never by any client (admins too).
  if tg_op = 'INSERT' then
    new.bin := null;
  else
    new.bin := old.bin;
  end if;

  if not public.is_admin() then
    if new.status not in ('pending', 'uploaded') then
      raise exception 'This payment status is set by the secretariat and cannot be self-assigned.';
    end if;
    -- Review fields belong to admins; a fresh submission clears any
    -- previous review outcome.
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

-- service_applications: same discipline for the payment columns.
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
    new.bin := null;
    new.payment_reviewed_by := null;
    new.payment_reviewed_at := null;
    new.payment_rejection_reason := null;
    if new.payment_status not in ('unpaid', 'uploaded', 'not_required') then
      raise exception 'This payment status is set by the secretariat and cannot be self-assigned.';
    end if;
    return new;
  end if;

  new.bin := old.bin;

  if not public.is_admin() then
    if new.status is distinct from old.status then
      raise exception 'Application status is set by the secretariat.';
    end if;
    -- Members may only (re)submit a receipt: -> 'uploaded', and never after
    -- the payment has been verified.
    if new.payment_status is distinct from old.payment_status
       and (new.payment_status <> 'uploaded'
            or old.payment_status not in ('unpaid', 'rejected', 'uploaded')) then
      raise exception 'This payment status is set by the secretariat and cannot be self-assigned.';
    end if;
    if old.payment_status = 'verified'
       and new.payment_receipt_url is distinct from old.payment_receipt_url then
      raise exception 'The receipt cannot be changed after verification.';
    end if;
    -- A fresh submission clears any previous review outcome.
    new.payment_reviewed_by := null;
    new.payment_reviewed_at := null;
    new.payment_rejection_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_a_protect_service_payment on public.service_applications;
create trigger trg_a_protect_service_payment
  before insert or update on public.service_applications
  for each row execute function public.protect_service_application_payment();
