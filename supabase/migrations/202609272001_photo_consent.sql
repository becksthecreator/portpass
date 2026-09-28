-- Photo consent (website refinement round 4, item 2).
--
-- Rule since 16 Sept: no recognisable child's face on the site until photo
-- consent is confirmed. Two flags carry it:
--   organizations.photo_consent_required  -- this business's photos may
--       include children (youth sport today; set by admin, and by the
--       wizard for new Sports & Fitness businesses)
--   organization_images.consent_confirmed -- someone with the signed forms
--       has confirmed consent for every child in this photo
-- Where consent is required, the public site renders only confirmed
-- images and falls back to the logo tile; every current image starts
-- unconfirmed. Antonio flips Futprep's from the registration records.

alter table public.organization_images
  add column if not exists consent_confirmed boolean not null default false;

alter table public.organizations
  add column if not exists photo_consent_required boolean not null default false;

update public.organizations
   set photo_consent_required = true
 where slug = 'futprep';

comment on column public.organization_images.consent_confirmed is
  'True once signed photo consent is confirmed for every child in the image. Public pages hide unconfirmed images of organizations with photo_consent_required.';
comment on column public.organizations.photo_consent_required is
  'This organization''s photos may include children; only consent_confirmed images render publicly.';
