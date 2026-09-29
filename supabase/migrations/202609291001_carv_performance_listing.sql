-- Carv Performance listing draft (02 brief, Part B, 29 Sept). Fills in
-- Jason's page as an UNPUBLISHED draft for Antonio to review: the
-- organization stays is_published = false and is_directory_listed = false,
-- so /sports-fitness keeps showing it as Coming Soon and
-- /sports-fitness/carv-performance stays private. Publishing is a
-- separate one-line migration after Jason approves the prices.
--
-- Re-runnable: the organization is updated by slug (inserted only if the
-- row is missing, same pattern as 202609221011), offerings upsert on
-- (organization_id, slug), and the FAQs are replaced as a set.

-- 1. The organization row, by slug; created if it is somehow missing.
insert into public.applications (organization_name, contact_person, email, phone, activity_type, main_location, player_count, help_needed, description, status)
select 'Carv Performance', 'Carv Performance Team', 'carv@portpass.local', 'Not provided', 'Performance training', 'Nassau, The Bahamas', 'TBD', 'PortPass setup', 'Performance coaching for athletes in Nassau.', 'submitted'
where not exists (select 1 from public.organizations where slug = 'carv-performance');

insert into public.organizations (application_id, name, primary_contact, email, phone, activity_type, main_location, slug, primary_category, brand_color, logo_url, is_published, is_directory_listed, status)
select id, 'Carv Performance', 'Carv Performance Team', 'carv@portpass.local', 'Not provided', 'Performance training', 'Nassau, The Bahamas', 'carv-performance', 'sports-fitness', '#E4FB3E', '/carv-logo.png', false, false, 'approved'
from public.applications
where organization_name = 'Carv Performance'
  and not exists (select 1 from public.organizations where slug = 'carv-performance')
order by id desc
limit 1;

update public.organizations set
  primary_category = 'sports-fitness',
  subcategory = 'strength-conditioning',
  island = 'New Providence',
  area = 'Palm Cay & Sandyport',
  one_liner = 'Speed, agility and strength training for athletes in Nassau, one-on-one or in small groups.',
  description = 'Carv Performance is performance coaching for athletes who want to get faster, stronger and more explosive. Coach Jason trains footballers, runners and everyday athletes at Palm Cay and Sandyport, with sessions built around speed, agility, strength and mindset. Start with an assessment, then train one-on-one, with a partner, or in a small group.',
  -- CONFIRM with Jason: read off his certificates.
  owner_name = 'Coach Jason Edwards',
  owner_bio = 'ISSA certified in Performance Enhancement, ASFA certified in Speed & Agility, and Alison certified in Physical Fitness Principles. Co-runs the Elite Series camp with FutPrep. His motto: Carving Potential into Performance.',
  website_url = 'https://www.instagram.com/carvperformance/',
  -- whatsapp_e164 stays NULL until Jason gives his number.
  photo_consent_required = true
where slug = 'carv-performance';

-- 2. Six services. Published at offering level so the admin preview renders
-- them; the organization itself stays unpublished. action_url stays NULL
-- until Jason's WhatsApp number is in.
insert into public.offerings (organization_id, type, slug, name, summary, price_cents, price_unit, is_featured, inclusions, sort_order, is_published)
select o.id, 'service', v.slug, v.name, v.summary, v.price_cents, v.price_unit, v.is_featured, v.inclusions, v.sort_order, true
from public.organizations o
cross join (values
  ('assessment',          'Performance Assessment', 'Start here. We test how you move, sprint and change direction, then build your plan.', 6000,  null::text,     false, array['45 minutes','Speed and agility baseline','A written plan for your sport','$60 credited if you buy a pack within 14 days'], 0),
  ('one-on-one',          '1-on-1 Session',         'An hour of coaching built around your goals.',                                          7500,  'per_session',  false, array['60 minutes','Speed, agility, strength or conditioning','Palm Cay or Sandyport'], 1),
  ('pack-4',              '4-Session Pack',         '$70 a session. Use within 6 weeks.',                                                    28000, null,           false, array['Four 60-minute 1-on-1 sessions','Save $20'], 2),
  ('pack-8',              '8-Session Pack',         '$65 a session. Use within 10 weeks.',                                                   52000, null,           true,  array['Eight 60-minute 1-on-1 sessions','Save $80','Re-test at the end'], 3),
  ('partner',             'Partner Session',        'Train with a teammate or friend. $55 each.',                                            11000, 'per_session',  false, array['60 minutes','2 athletes, 1 coach'], 4),
  ('speed-agility-group', 'Speed & Agility Group',  'Small-group speed work: sprints, ladders and change of direction.',                    3000,  'per_person',   false, array['60 minutes','3 to 8 athletes','Or $200 for an 8-session block'], 5)
) as v(slug, name, summary, price_cents, price_unit, is_featured, inclusions, sort_order)
where o.slug = 'carv-performance'
on conflict (organization_id, slug) do update set
  type = excluded.type,
  name = excluded.name,
  summary = excluded.summary,
  price_cents = excluded.price_cents,
  price_unit = excluded.price_unit,
  is_featured = excluded.is_featured,
  inclusions = excluded.inclusions,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published,
  updated_at = now();

-- 3. FAQs, replaced as a set (no unique key on question).
delete from public.organization_faqs where organization_id = (select id from public.organizations where slug = 'carv-performance');
insert into public.organization_faqs (organization_id, question, answer, sort_order)
select o.id, v.question, v.answer, v.sort_order
from public.organizations o
cross join (values
  ('Who do you train?',            'Athletes of all levels, from youth footballers to adults who want to move better. If you''re under 18, a parent or guardian books and signs for you.', 0),
  ('Where do sessions happen?',    'Palm Cay and Sandyport. Tell us where you''re based when you book.', 1),
  ('What should I bring?',         'Trainers, water and a towel. We bring the equipment.', 2),
  ('What if I need to cancel?',    'Give at least 12 hours'' notice and your session moves. Later than that, or a no-show, counts as a session used.', 3),
  -- CONFIRM with Jason.
  ('How do I pay?',                'Cash or bank transfer, before your first session. Packs are paid up front.', 4)
) as v(question, answer, sort_order)
where o.slug = 'carv-performance';
