-- Extra fields to match the 6-step guided planner (ceremony, day/travel
-- details, venue style, services, consultation method+time, contact) from
-- the approved Bahamas Weddings By The Sea reference design.
alter table public.wedding_inquiries
  add column if not exists arrival_date text,
  add column if not exists location_idea text,
  add column if not exists travelling_from text,
  add column if not exists consultation_date text,
  add column if not exists consultation_time text,
  add column if not exists consultation_timezone text;

-- The planner's quick homepage enquiry (unlike the full 6-step plan) treats
-- email as optional, matching the approved reference design.
alter table public.wedding_inquiries alter column contact_email drop not null;
