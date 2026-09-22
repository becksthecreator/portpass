-- Gives Bahamas Weddings By The Sea real content in the same tables every
-- other business uses (offerings/organization_images/organization_faqs),
-- so it can finally render through OrganizationTemplate instead of a
-- bespoke page. custom_domain and identity_layout are the two new
-- generic template options this business is the first to use -- any
-- future business (Carv, etc.) can set the same two columns with no code
-- change: a domain routes to it via middleware, and identity_layout
-- controls which IdentityBlock treatment it gets.
alter table public.organizations add column if not exists custom_domain text unique;
alter table public.organizations add column if not exists identity_layout text;

update public.organizations set
  owner_name = 'Antonio Beckford',
  owner_bio = 'Antonio Beckford is the planner and licensed officiant behind Bahamas Weddings By The Sea. With more than 26 years of experience, he brings a personal touch to every ceremony and clear guidance to the planning -- from your first questions to the words you say at the water''s edge.',
  owner_image_url = '/weddings/bahamas-by-the-sea/antonio.jpg',
  description = 'Bahamas Weddings By The Sea plans and officiates beachfront ceremonies in Nassau -- real prices, a real planning desk, and Antonio himself at the water''s edge.',
  identity_layout = 'split'
where slug = 'bahamas-weddings';

-- Mirrors the four live rows in wedding_packages (202609210002) -- same
-- prices, same order, same featured tier. action_url still points at the
-- existing plan wizard under the bespoke path, which stays live and
-- unmoved until the domain cutover happens.
insert into public.offerings (organization_id, type, slug, name, summary, price_cents, price_unit, inclusions, image_url, action_url, sort_order, is_featured, is_published)
select o.id, v.type, v.slug, v.name, v.summary, v.price_cents, v.price_unit, v.inclusions, v.image_url, v.action_url, v.sort_order, v.is_featured, true
from public.organizations o
cross join (values
  ('service', 'pink-sand', 'Pink Sand', 'Just the ceremony', 50000, 'from', array['Antonio as your licensed officiant','Ceremony script consultation','Guidance on the marriage licence process'], '/weddings/bahamas-by-the-sea/catalogue-14.webp', '/weddings/bahamas-by-the-sea/plan?tier=pink-sand', 0, false),
  ('service', 'yellow-elder', 'Yellow Elder', 'Ceremony + photography', 100000, 'from', array['Everything in Pink Sand','Ceremony photography','Licence paperwork handled'], '/weddings/bahamas-by-the-sea/catalogue-13.webp', '/weddings/bahamas-by-the-sea/plan?tier=yellow-elder', 1, false),
  ('service', 'poinciana', 'Poinciana', 'The full island day', 250000, 'from', array['Everything in Yellow Elder','One hour of photography coverage','Island transportation on the day','Planning consultation with Antonio','Ceremony rehearsal included (normally $60)','Coordination with your photographer, florist and venue'], '/weddings/bahamas-by-the-sea/catalogue-05.webp', '/weddings/bahamas-by-the-sea/plan?tier=poinciana', 2, true),
  ('service', 'hibiscus', 'Hibiscus', 'Everything planned for you', 350000, 'from', array['Everything in Poinciana','Venue selection and booking','Flowers, photography and film arranged for you','Full transport planning','A single point of contact from first enquiry to the day itself'], '/weddings/bahamas-by-the-sea/catalogue-10.webp', '/weddings/bahamas-by-the-sea/plan?tier=hibiscus', 3, false)
) as v(type, slug, name, summary, price_cents, price_unit, inclusions, image_url, action_url, sort_order, is_featured)
where o.slug = 'bahamas-weddings'
on conflict (organization_id, slug) do nothing;

-- The same four images already curated for the PortPass listing page's
-- gallery (round 3: excludes catalogue-01/05 from this set since 05 is a
-- package-tier photo above).
insert into public.organization_images (organization_id, url, alt, sort_order)
select o.id, v.url, v.alt, v.sort_order
from public.organizations o
cross join (values
  ('/weddings/bahamas-by-the-sea/ceremony.jpg', 'A real Bahamas Weddings By The Sea celebration on the beach.', 0),
  ('/weddings/bahamas-by-the-sea/catalogue-02.webp', 'A quiet garden moment between the couple.', 1),
  ('/weddings/bahamas-by-the-sea/catalogue-03.webp', 'Beachfront portraits with a colourful bouquet.', 2),
  ('/weddings/bahamas-by-the-sea/catalogue-04.webp', 'A white floral arch overlooking the venue grounds.', 3)
) as v(url, alt, sort_order)
where o.slug = 'bahamas-weddings'
and not exists (select 1 from public.organization_images where organization_id = o.id);

-- Real FAQ copy carried over verbatim from the bespoke page's own FAQ
-- section (app/weddings/bahamas-by-the-sea/page.tsx) -- not rewritten.
insert into public.organization_faqs (organization_id, question, answer, sort_order)
select o.id, v.question, v.answer, v.sort_order
from public.organizations o
cross join (values
  ('Can we plan everything before we arrive?', 'Start with the Wedding Desk from wherever you live. Share your travel plans, ceremony ideas, and questions so the team can prepare your consultation and organize the plan for Antonio.', 0),
  ('What about the marriage licence?', 'A legal wedding requires a Bahamian marriage licence. Allow time for the application and approval before your ceremony, and discuss your arrival dates and documents with the team before finalizing travel. Cruise itineraries also need careful timing.', 1),
  ('Can our ceremony reflect our beliefs?', 'Antonio offers nonreligious and interfaith ceremonies. Tell the Wedding Desk about the traditions, readings, and personal touches you would like included. Optional premarital counselling may also be requested.', 2),
  ('How much does a ceremony cost?', 'Ask for a personal quote based on your date, location, guest count, and the services you need. Antonio reviews the completed plan before availability, pricing, inclusions, and booking terms are confirmed.', 3),
  ('Does an enquiry reserve our date?', 'No. An enquiry starts the pre-consultation. The Wedding Desk organizes your plan, then Antonio confirms availability and provides the next steps. A date is reserved only after the booking terms are agreed.', 4)
) as v(question, answer, sort_order)
where o.slug = 'bahamas-weddings'
and not exists (select 1 from public.organization_faqs where organization_id = o.id);

-- Only safe now that the offerings above exist: is_published is gated by
-- check_organization_publish_requires_priced_offering.
update public.organizations set is_published = true where slug = 'bahamas-weddings';
