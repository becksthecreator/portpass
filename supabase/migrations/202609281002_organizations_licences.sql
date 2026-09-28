-- Round 5, §7: business licence details, kept for a verification process
-- that does not exist yet. Admin only: no public or owner select includes
-- these columns (LISTING_ORGANIZATION_COLUMNS in db/organizations.ts and
-- BUSINESS_COLUMNS in db/business.ts are explicit lists), and nothing
-- renders them until verification is built. db/licences.ts is the only
-- reader and writer.
alter table public.organizations
  add column if not exists licences            jsonb not null default '[]'::jsonb,
  add column if not exists licence_verified_at timestamptz,
  add column if not exists licence_verified_by uuid references auth.users(id);

alter table public.organizations drop constraint if exists organizations_licences_is_array;
alter table public.organizations add constraint organizations_licences_is_array
  check (jsonb_typeof(licences) = 'array');

comment on column public.organizations.licences is
  'Array of {type, number, expires_on, document_url}. Admin only; never rendered publicly.';
