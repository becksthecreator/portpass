-- Registration for any business (brief 18, part D).
--
-- A programme says who it is for. Children's programmes keep everything
-- they ask today (guardian, emergency contact, health details, pickup).
-- An adults' programme asks for none of that: the person registering is
-- the participant. "mixed" lets the person say which they are.
alter table public.programs add column if not exists audience text not null default 'children';
alter table public.programs drop constraint if exists programs_audience_check;
alter table public.programs add constraint programs_audience_check check (audience in ('children', 'adults', 'mixed'));

comment on column public.programs.audience is
  'Who the programme is for: children (guardian, emergency and health details asked), adults (none of them), or mixed (the registrant says).';

-- The registration itself records which it was, so a staff screen never
-- has to guess, and no health field is ever expected on an adult's row.
alter table public.registrations add column if not exists participant_is_adult boolean not null default false;
