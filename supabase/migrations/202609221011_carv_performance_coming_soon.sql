-- Carv Performance, per block F1 of the 22 September brief: "This is a
-- data gap, not a bug... There is no Carv Performance row in the
-- database at all." Creates one, deliberately unpublished -- Jason's
-- setup questionnaire is still blank (meeting is 23 September, the day
-- after this migration), so there is no real price, service list, or
-- contact info yet. is_published stays false (the platform's own
-- check_organization_publish_requires_priced_offering trigger would
-- refuse true anyway, correctly, since no offerings exist) and
-- is_directory_listed also stays false, since that flag drives the
-- homepage's "Open now on PortPass" carousel and category chips, and
-- Carv is not open yet. The /sports-fitness category page reads this
-- row directly (regardless of either flag) to render it as a
-- Coming Soon card -- see db/organizations.ts:listCategoryDirectoryEntries
-- and app/_components/blocks/ComingSoonCard.tsx.
--
-- application_id/primary_contact/email/phone/activity_type/main_location
-- are legacy NOT NULL columns from the org-admin intake table this public
-- listing layer reuses (see the file's own comment at ~line 424) -- real
-- values aren't known yet, so these follow the same placeholder
-- convention already used for Futprep/BWS's rows (an @portpass.local
-- email, "Not provided" phone).
insert into public.applications (organization_name, contact_person, email, phone, activity_type, main_location, player_count, help_needed, description, status)
select 'Carv Performance', 'Carv Performance Team', 'carv@portpass.local', 'Not provided', 'Performance training', 'Nassau, The Bahamas', 'TBD', 'PortPass setup pending Jason''s 23 September questionnaire', 'Performance training business onboarding onto PortPass -- setup session scheduled for 23 September 2026.', 'submitted'
where not exists (select 1 from public.organizations where slug = 'carv-performance');

insert into public.organizations (application_id, name, primary_contact, email, phone, activity_type, main_location, slug, primary_category, brand_color, logo_url, is_published, is_directory_listed)
select id, 'Carv Performance', 'Carv Performance Team', 'carv@portpass.local', 'Not provided', 'Performance training', 'Nassau, The Bahamas', 'carv-performance', 'sports-fitness', '#E4FB3E', '/carv-logo.png', false, false
from public.applications
where organization_name = 'Carv Performance'
and not exists (select 1 from public.organizations where slug = 'carv-performance')
order by id desc
limit 1;
