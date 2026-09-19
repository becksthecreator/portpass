-- Marks whether the medical fields currently on file were entered by the
-- parent (via the normal wizard or the completion page) or typed in by
-- staff on the family's behalf -- shown as a clear label in the staff
-- detail view. Null until either has entered anything.
alter table public.registrations
  add column if not exists medical_info_source text check (medical_info_source in ('parent','staff'));

-- Lightweight per-edit audit trail for the staff detail view: every save
-- records who changed what. changes is a small {field: {from, to}} map.
create table if not exists public.registration_edits (
  id bigint generated always as identity primary key,
  registration_id bigint not null references public.registrations(id) on delete cascade,
  changed_by text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.registration_edits enable row level security;

-- "Optional reference" for a recorded payment (e.g. a bank transfer id),
-- separate from the free-text note.
alter table public.payments add column if not exists reference text;
