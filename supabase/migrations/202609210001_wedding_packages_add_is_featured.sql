-- "Most chosen" badge for the package tiers -- drives a UI highlight on
-- exactly one live package. The partial unique index enforces "at most
-- one"; app code (upsertWeddingPackage) is responsible for clearing any
-- previous holder before setting a new one, so there's always exactly one
-- among the live tiers in practice.
alter table public.wedding_packages
  add column if not exists is_featured boolean not null default false;

create unique index if not exists wedding_packages_one_featured
  on public.wedding_packages ((is_featured))
  where is_featured;
