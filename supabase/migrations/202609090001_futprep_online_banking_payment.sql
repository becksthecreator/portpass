-- Widen payment_method / method to allow "online_banking" as a third Futprep
-- payment channel (parent-initiated transfer from their own bank's online or
-- mobile banking app), alongside the existing "cash" and "bank_transfer".
-- Purely additive: existing rows already satisfy the widened check.

alter table public.registrations
  drop constraint if exists registrations_payment_method_check;
alter table public.registrations
  add constraint registrations_payment_method_check
  check (payment_method in ('cash','bank_transfer','online_banking'));

alter table public.payments
  drop constraint if exists payments_method_check;
alter table public.payments
  add constraint payments_method_check
  check (method in ('cash','bank_transfer','online_banking'));
