-- Bahamas Weddings By The Sea: a real organization row so wedding staff
-- accounts can live in the existing staff_members table (already scoped by
-- organization_id) under their own org, alongside Futprep's. No schema
-- change needed on staff_members itself -- it already supports this.
do $$
declare
  new_application_id bigint;
begin
  if not exists (select 1 from public.organizations where slug = 'bahamas-weddings') then
    insert into public.applications (
      organization_name, contact_person, email, phone, activity_type,
      main_location, player_count, help_needed, description, status
    )
    values (
      'Bahamas Weddings By The Sea', 'Antonio Beckford', 'weddings@portpass.local', 'Not provided',
      'Wedding planning & officiant services', 'Nassau, The Bahamas', 'N/A', 'N/A',
      'Wedding planning and officiant services desk.', 'approved'
    )
    returning id into new_application_id;

    insert into public.organizations (
      application_id, name, primary_contact, email, phone, activity_type,
      main_location, slug, registration_url
    )
    values (
      new_application_id, 'Bahamas Weddings By The Sea', 'Antonio Beckford', 'weddings@portpass.local',
      'Not provided', 'Wedding planning & officiant services', 'Nassau, The Bahamas',
      'bahamas-weddings', '/weddings/bahamas-by-the-sea/plan'
    );
  end if;
end $$;

-- Internal enquiry notes, kept structurally separate from wedding_leads so
-- there is no code path by which a couple-visible field could accidentally
-- carry a staff note. Multiple timestamped notes per lead, mirroring the
-- registration_edits audit pattern used on the Futprep side.
create table if not exists public.wedding_lead_notes (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.wedding_leads(id) on delete cascade,
  author text not null,
  note text not null,
  created_at timestamptz not null default now()
);
alter table public.wedding_lead_notes enable row level security;

-- A simple blocked-dates list for Antonio's calendar -- not a full booking
-- system, just what he'll actually maintain.
create table if not exists public.wedding_unavailable_dates (
  id bigint generated always as identity primary key,
  on_date date not null unique,
  note text,
  created_by bigint references public.staff_members(id),
  created_at timestamptz not null default now()
);
alter table public.wedding_unavailable_dates enable row level security;
