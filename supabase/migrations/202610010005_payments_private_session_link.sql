-- Private-session payments (brief 06 v2, Part B) are recorded in the same
-- payments table as term fees, against a PS- request instead of a
-- registration. So registration_id can be empty, and every payment must
-- belong to exactly one of the two.
alter table public.payments
  alter column registration_id drop not null;

alter table public.payments
  drop constraint if exists payments_one_owner_check;
alter table public.payments
  add constraint payments_one_owner_check
  check (num_nonnulls(registration_id, private_session_request_id) = 1);
