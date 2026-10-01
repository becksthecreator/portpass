-- Privacy Policy v2 and Terms v2 (brief 16 D; brief 07): record which
-- versions a person agreed to when they created their PortPass account.
-- The sign-up and sign-in screens now say "By continuing you agree to our
-- Terms of Service and Privacy Policy"; lib/legal.ts holds the versions.
-- Null on accounts created before this (they were never shown that line).
alter table public.profiles
  add column if not exists terms_version integer,
  add column if not exists privacy_version integer,
  add column if not exists legal_accepted_at timestamptz;

comment on column public.profiles.terms_version is 'Version of /terms in force when the account was created (lib/legal.ts).';
comment on column public.profiles.privacy_version is 'Version of /privacy in force when the account was created (lib/legal.ts).';
