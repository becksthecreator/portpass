-- The demo business (brief 18, part B): "Harbour Kids Club (Demo)", a
-- fictional business anyone can explore from /demo. Invented names only,
-- phone numbers in 242-555-01xx, emails at example.com, and no health,
-- emergency or pickup detail for any child. It is never public, never in a
-- total for real businesses, and it is put back to this starting point
-- every night and whenever a platform owner presses "Reset demo".

-- 1. One business may be the demo, and it can never be made public.
alter table public.organizations add column if not exists is_demo boolean not null default false;
alter table public.organizations add column if not exists demo_reset_at timestamptz;

alter table public.organizations drop constraint if exists organizations_demo_never_public;
alter table public.organizations add constraint organizations_demo_never_public
  check (not is_demo or (not is_published and not is_directory_listed and status = 'draft' and custom_domain is null));

create unique index if not exists organizations_one_demo on public.organizations (is_demo) where is_demo;

comment on column public.organizations.is_demo is
  'The demo business behind /demo. Never published, never listed, never counted with real businesses.';

-- 2. Visits to the demo's pages are example data: not in the site's count.
create or replace function public.site_visit_counts(since timestamptz, top_n integer default 5)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with views as (
    select e.path
      from public.page_events e
     where e.event = 'view'
       and e.created_at >= since
       and not exists (select 1 from public.organizations o where o.id = e.organization_id and o.is_demo)
  ), top as (
    select v.path, count(*)::bigint as views from views v group by v.path order by count(*) desc, v.path limit greatest(least(top_n, 50), 0)
  )
  select jsonb_build_object(
    'views', (select count(*) from views),
    'topPages', coalesce((select jsonb_agg(jsonb_build_object('path', t.path, 'views', t.views) order by t.views desc, t.path) from top t), '[]'::jsonb)
  );
$$;

revoke all on function public.site_visit_counts(timestamptz, integer) from public, anon, authenticated;

-- 3. Put the demo back to its starting point (and make it, the first time).
--    Every date is worked out from today in Nassau, so the demo always has
--    three Saturdays of attendance behind it, requests that are overdue
--    today, and a term in progress. The business's row and id are kept;
--    everything under it is removed and written again.
create or replace function public.reset_demo_business()
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_org bigint;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'America/Nassau')::date;
  v_back integer := (extract(dow from (now() at time zone 'America/Nassau')::date)::integer + 1) % 7;
  v_last_sat date;
  v_start date;
  v_end date;
  v_prev_start date;
  v_prev_end date;
  v_p1 bigint;
  v_p2 bigint;
  v_t1 bigint;
  v_t2 bigint;
  v_t1p bigint;
  v_t2p bigint;
  v_party bigint;
  v_wed date;
  v_path constant text := '/sports-fitness/harbour-kids-club-demo';
begin
  -- One reset at a time (the nightly job and the button can meet).
  perform pg_advisory_xact_lock(hashtext('portpass_demo_reset'));

  -- The last Saturday before today; the term began two Saturdays before it.
  if v_back = 0 then v_back := 7; end if;
  v_last_sat := v_today - v_back;
  v_start := v_last_sat - 14;
  v_end := v_start + 76;
  v_prev_start := v_start - 91;
  v_prev_end := v_start - 8;

  select id into v_org from public.organizations where is_demo limit 1;
  if v_org is null then
    insert into public.organizations (name, slug, status, is_published, is_directory_listed, is_demo, created_by_admin)
    values ('Harbour Kids Club (Demo)', 'harbour-kids-club-demo', 'draft', false, false, true, true)
    returning id into v_org;
  end if;

  update public.organizations
     set name = 'Harbour Kids Club (Demo)',
         slug = 'harbour-kids-club-demo',
         status = 'draft',
         is_published = false,
         is_directory_listed = false,
         primary_category = 'sports-fitness',
         subcategory = null,
         island = 'New Providence',
         area = 'Nassau',
         one_liner = 'Saturday clubs and after-school art for children aged 5 to 12. A demo business: everything here is example data.',
         description = 'Harbour Kids Club is a made-up business that shows what PortPass does for a real one: a page with prices, registrations, payment requests, attendance and a growth report. Nothing here is real, and nothing is sent to anyone.',
         brand_color = '#0B6E79',
         logo_url = null,
         hero_image_url = null,
         owner_name = null,
         owner_bio = null,
         owner_image_url = null,
         website_url = null,
         primary_contact = 'Demo team',
         email = 'hello@example.com',
         public_email = 'hello@example.com',
         phone = null,
         phone_e164 = null,
         whatsapp_e164 = null,
         instagram_handle = null,
         google_business_url = null,
         reviews_url = null,
         rating = null,
         review_count = null,
         payment_methods = array['cash', 'bank_transfer'],
         bank_transfer_details = jsonb_build_object('bank', 'Example Bank (demo)', 'accountName', 'Harbour Kids Club Demo', 'accountNumber', 'Ending 0000', 'branch', '', 'instructions', 'This is a demo business. Please do not send money.'),
         photo_consent_required = false,
         review_note = null,
         demo_reset_at = v_now
   where id = v_org;

  -- Everything under the business goes, in an order the foreign keys allow.
  delete from public.payment_requests where organization_id = v_org;
  delete from public.registrations where organization_id = v_org;
  delete from public.programs where organization_id = v_org;
  delete from public.offerings where organization_id = v_org;
  delete from public.organization_faqs where organization_id = v_org;
  delete from public.page_events where organization_id = v_org;
  delete from public.private_session_requests where organization_id = v_org;
  delete from public.reservations where organization_id = v_org;
  delete from public.organization_invites where organization_id = v_org;
  delete from public.organization_members where organization_id = v_org;

  -- Three offerings on the page.
  insert into public.offerings (organization_id, type, slug, name, summary, price_cents, price_unit, schedule_text, age_min, age_max, sort_order, is_featured, is_published)
  values
    (v_org, 'program', 'saturday-kids-club', 'Saturday Kids Club', 'Games, swimming and crafts every Saturday morning.', 18000, 'per_term', 'Saturdays, 9:30 to 11:30 am', 5, 9, 1, true, true),
    (v_org, 'program', 'after-school-art-club', 'After-School Art Club', 'Painting, clay and printmaking after school.', 15000, 'per_term', 'Wednesdays, 3:30 to 5:00 pm', 7, 12, 2, false, true);
  insert into public.offerings (organization_id, type, slug, name, summary, price_cents, price_unit, sort_order, is_featured, is_published)
  values (v_org, 'service', 'birthday-party', 'Birthday party package', 'Two hours of games and crafts for up to 12 children.', 35000, 'from', 3, false, true)
  returning id into v_party;

  insert into public.organization_faqs (organization_id, question, answer, sort_order)
  values
    (v_org, 'Is this a real business?', 'No. Harbour Kids Club is a demo: every name, number and payment here is made up.', 1),
    (v_org, 'How do families pay?', 'A real business on PortPass is paid directly, by cash or bank transfer. PortPass never holds the money.', 2),
    (v_org, 'What do I need to bring?', 'A water bottle, a hat and clothes that can get messy.', 3);

  -- Two programmes, each with last term and this term. The sessions are
  -- written by the term trigger (every Saturday, every Wednesday).
  insert into public.programs (organization_id, slug, name, age_min, age_max, coed, location, day_of_week, start_time, end_time, capacity, active, program_type, is_public, audience)
  values (v_org, 'demo-harbour-saturday-kids-club', 'Saturday Kids Club', 5, 9, true, 'Harbour Hall, Nassau', 'Saturday', '9:30 AM', '11:30 AM', 16, true, 'term', true, 'children')
  returning id into v_p1;
  insert into public.programs (organization_id, slug, name, age_min, age_max, coed, location, day_of_week, start_time, end_time, capacity, active, program_type, is_public, audience)
  values (v_org, 'demo-harbour-art-club', 'After-School Art Club', 7, 12, true, 'Harbour Hall, Nassau', 'Wednesday', '3:30 PM', '5:00 PM', 12, true, 'term', true, 'children')
  returning id into v_p2;

  insert into public.program_terms (program_id, name, start_date, end_date, weekly_fee_cents, term_fee_cents, registration_fee_cents, active)
  values (v_p1, 'Last term', v_prev_start, v_prev_end, 2000, 18000, 0, false) returning id into v_t1p;
  insert into public.program_terms (program_id, name, start_date, end_date, weekly_fee_cents, term_fee_cents, registration_fee_cents, active)
  values (v_p2, 'Last term', v_prev_start, v_prev_end, 1500, 15000, 0, false) returning id into v_t2p;
  insert into public.program_terms (program_id, name, start_date, end_date, weekly_fee_cents, term_fee_cents, registration_fee_cents, active)
  values (v_p1, 'This term', v_start, v_end, 2000, 18000, 0, true) returning id into v_t1;
  insert into public.program_terms (program_id, name, start_date, end_date, weekly_fee_cents, term_fee_cents, registration_fee_cents, active)
  values (v_p2, 'This term', v_start, v_end, 1500, 15000, 0, true) returning id into v_t2;

  -- Registrations. No date of birth, and no health, emergency or pickup
  -- detail for any child. `fam` gives a family one phone number.
  insert into public.registrations (
    reference_code, organization_id, program_id, term_id, parent_name, parent_email, parent_phone, relationship, child_name,
    photo_consent, payment_frequency, payment_method, amount_due_cents, registration_status, payment_status,
    consent_version, consent_accepted, consent_at, signature_name, submitted_at, source_channel, is_new_family, commission_eligible, participant_is_adult)
  select 'HKD-' || lpad(t.n::text, 4, '0'), v_org,
         case when t.prog = 1 then v_p1 else v_p2 end,
         case when t.last_term then (case when t.prog = 1 then v_t1p else v_t2p end) else (case when t.prog = 1 then v_t1 else v_t2 end) end,
         t.parent, lower(replace(t.parent, ' ', '.')) || '@example.com', '+12425550' || (100 + t.fam)::text, t.rel, t.child,
         t.photo, 'term', case when t.fam % 2 = 0 then 'cash' else 'bank_transfer' end,
         case when t.prog = 1 then 18000 else 15000 end, t.status, t.pay,
         'demo', true,
         case when t.last_term then (v_prev_start - 10)::timestamp at time zone 'America/Nassau' else v_now - make_interval(days => t.ago) end,
         t.parent,
         case when t.last_term then (v_prev_start - 10)::timestamp at time zone 'America/Nassau' else v_now - make_interval(days => t.ago) end,
         t.channel, t.is_new, false, false
    from (values
      (1,   1,  false, 'Maya Brightwater', 'Renee Brightwater',  'Mother', 1, 'confirmed', 'paid',    'instagram',        30, 'yes', false),
      (2,   2,  false, 'Theo Palmgrove',   'Marcus Palmgrove',   'Father', 1, 'confirmed', 'paid',    'portpass_listing', 28, 'yes', false),
      (3,   3,  false, 'Lila Seabright',   'Dana Seabright',     'Mother', 1, 'confirmed', 'partial', 'whatsapp',         27, 'no',  false),
      (4,   4,  false, 'Noah Coralwood',   'Simone Coralwood',   'Mother', 1, 'confirmed', 'overdue', 'qr',               25, 'yes', true),
      (5,   5,  false, 'Ava Tidewell',     'Jerome Tidewell',    'Father', 1, 'confirmed', 'paid',    'referral',         24, 'yes', false),
      (6,   6,  false, 'Eli Sunridge',     'Priya Sunridge',     'Mother', 1, 'confirmed', 'overdue', 'google',           21, 'yes', true),
      (7,   7,  false, 'Zoe Bayfield',     'Andre Bayfield',     'Father', 1, 'pending',   'pending', 'portpass_link',     6, 'yes', true),
      (8,   8,  false, 'Kai Windmere',     'Lena Windmere',      'Mother', 1, 'confirmed', 'partial', 'instagram',        20, 'no',  true),
      (9,   9,  false, 'Ruby Shellby',     'Owen Shellby',       'Father', 1, 'pending',   'pending', 'word_of_mouth',     2, 'yes', true),
      (10,  10, false, 'Finn Reefton',     'Carla Reefton',      'Mother', 2, 'confirmed', 'paid',    'portpass_listing', 26, 'yes', false),
      (11,  11, false, 'Isla Lakemont',    'Victor Lakemont',    'Father', 2, 'confirmed', 'overdue', 'instagram',        23, 'yes', true),
      (12,  12, false, 'Milo Fernhill',    'Tasha Fernhill',     'Mother', 2, 'confirmed', 'paid',    'school',           19, 'yes', false),
      (13,  13, false, 'Nia Driftwood',    'Paul Driftwood',     'Father', 2, 'confirmed', 'pending', 'whatsapp',          9, 'no',  true),
      (14,  14, false, 'Leo Goldsand',     'Amara Goldsand',     'Mother', 2, 'pending',   'pending', 'qr',                1, 'yes', true),
      (101, 1,  true,  'Maya Brightwater', 'Renee Brightwater',  'Mother', 1, 'confirmed', 'paid',    'instagram',         0, 'yes', true),
      (102, 2,  true,  'Theo Palmgrove',   'Marcus Palmgrove',   'Father', 1, 'confirmed', 'paid',    'portpass_listing',  0, 'yes', true),
      (103, 3,  true,  'Lila Seabright',   'Dana Seabright',     'Mother', 1, 'confirmed', 'paid',    'word_of_mouth',     0, 'no',  true),
      (105, 5,  true,  'Ava Tidewell',     'Jerome Tidewell',    'Father', 1, 'confirmed', 'paid',    'referral',          0, 'yes', true),
      (106, 15, true,  'Omar Pinecrest',   'Hana Pinecrest',     'Mother', 1, 'confirmed', 'paid',    'google',            0, 'yes', true),
      (110, 10, true,  'Finn Reefton',     'Carla Reefton',      'Mother', 2, 'confirmed', 'paid',    'portpass_listing',  0, 'yes', true),
      (112, 12, true,  'Milo Fernhill',    'Tasha Fernhill',     'Mother', 2, 'confirmed', 'paid',    'school',            0, 'yes', true),
      (113, 16, true,  'Tia Marshgate',    'Joel Marshgate',     'Father', 2, 'confirmed', 'paid',    'instagram',         0, 'yes', true)
    ) as t(n, fam, last_term, child, parent, rel, prog, status, pay, channel, ago, photo, is_new);

  -- Last term's fees, all received.
  insert into public.payments (registration_id, amount_cents, method, status, recorded_by, note, received_at)
  select r.id, r.amount_due_cents, case when r.payment_method = 'cash' then 'cash' else 'bank_transfer' end, 'received', 'Demo team', '',
         (v_prev_start + (r.id % 5)::integer)::timestamp at time zone 'America/Nassau'
    from public.registrations r
   where r.organization_id = v_org and r.term_id in (v_t1p, v_t2p);

  -- How the demo is paid, and its numbering.
  insert into public.organization_payment_settings (
    organization_id, reference_prefix, next_request_number, next_receipt_number, bank_name, account_name, account_number_last4,
    transfer_instructions, kanoo_handle_or_phone, cash_note, default_due_days, updated_at, updated_by, accepted_methods)
  values (v_org, 'HKC', 15, 8, 'Example Bank (demo)', 'Harbour Kids Club Demo', '0000',
          'This is a demo business. Please do not send money.', '', 'Pay at the front desk (demo).', 7, v_now, 'Demo', array['cash', 'bank_transfer'])
  on conflict (organization_id) do update
    set reference_prefix = excluded.reference_prefix,
        next_request_number = excluded.next_request_number,
        next_receipt_number = excluded.next_receipt_number,
        bank_name = excluded.bank_name,
        account_name = excluded.account_name,
        account_number_last4 = excluded.account_number_last4,
        transfer_instructions = excluded.transfer_instructions,
        kanoo_handle_or_phone = excluded.kanoo_handle_or_phone,
        cash_note = excluded.cash_note,
        default_due_days = excluded.default_due_days,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by,
        accepted_methods = excluded.accepted_methods;

  -- Payment requests for this term's fees: paid, part paid, overdue, sent
  -- and not yet sent. The customer's page names the child by first name
  -- and the programme, nothing else.
  insert into public.payment_requests (
    organization_id, reference_number, reference_code, public_token, customer_name, customer_email, customer_phone, registration_id,
    line_items, total_cents, due_date, allow_part_payment, methods_allowed, sent_via, sent_at,
    last_reminded_at, last_reminded_via, reminder_count, customer_says_paid_at, created_by_name, created_at)
  select v_org, q.k, 'HKC-' || lpad(q.k::text, 4, '0'),
         replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
         r.parent_name, r.parent_email, r.parent_phone, r.id,
         jsonb_build_array(jsonb_build_object(
           'label', 'Term fee: ' || case when r.program_id = v_p1 then 'Saturday Kids Club' else 'After-School Art Club' end || ' (' || split_part(r.child_name, ' ', 1) || ')',
           'qty', 1, 'unit_cents', r.amount_due_cents)),
         r.amount_due_cents, v_today + q.due_in, q.part, array['cash', 'bank_transfer'],
         case when q.sent_ago is null then null when q.k % 2 = 0 then 'email' else 'whatsapp_link' end,
         case when q.sent_ago is null then null else v_now - make_interval(days => q.sent_ago) end,
         case when q.reminded_ago is null then null else v_now - make_interval(days => q.reminded_ago) end,
         case when q.reminded_ago is null then null else 'whatsapp_link' end,
         case when q.reminded_ago is null then 0 else 1 end,
         case when q.says_paid_ago is null then null else v_now - make_interval(days => q.says_paid_ago) end,
         'Demo team',
         v_now - make_interval(days => coalesce(q.sent_ago, 0))
    from (values
      (1,  1,  -21, 28,   false, null, null),
      (2,  2,  -19, 26,   false, null, null),
      (3,  3,    5,  9,   true,  null, null),
      (4,  4,  -10, 24,   false, 3,    null),
      (5,  5,  -17, 24,   false, null, null),
      (6,  6,   -6, 20,   false, null, 1),
      (7,  7,    7, null, false, null, null),
      (8,  8,   -3, 18,   true,  null, null),
      (9,  9,    7, null, false, null, null),
      (10, 10, -19, 26,   false, null, null),
      (11, 11, -12, 22,   false, null, null),
      (12, 12, -12, 19,   false, null, null),
      (13, 13,   4,  3,   false, null, null)
    ) as q(k, n, due_in, sent_ago, part, reminded_ago, says_paid_ago)
    join public.registrations r on r.organization_id = v_org and r.reference_code = 'HKD-' || lpad(q.n::text, 4, '0');

  -- One request that isn't for a registration: a birthday party.
  insert into public.payment_requests (
    organization_id, reference_number, reference_code, public_token, customer_name, customer_email, customer_phone, offering_id,
    line_items, total_cents, due_date, allow_part_payment, methods_allowed, sent_via, sent_at, created_by_name, created_at)
  values (v_org, 14, 'HKC-0014',
          replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
          'Grace Harborough', 'grace.harborough@example.com', '+12425550120', v_party,
          jsonb_build_array(jsonb_build_object('label', 'Birthday party package', 'qty', 1, 'unit_cents', 35000)),
          35000, v_today + 9, true, array['cash', 'bank_transfer'], 'email', v_now - interval '1 day', 'Demo team', v_now - interval '1 day');

  -- The money received against them, each with a receipt number. The
  -- request's paid amount and status follow from these rows.
  insert into public.payments (registration_id, payment_request_id, amount_cents, method, status, recorded_by, note, received_at, receipt_number)
  select pr.registration_id, pr.id, p.cents, p.method, 'received', 'Demo team', '', v_now - make_interval(days => p.ago), 'HKC-R' || lpad(p.receipt::text, 4, '0')
    from (values
      (1,  18000, 'bank_transfer', 26, 1),
      (2,  18000, 'cash',          24, 2),
      (5,  18000, 'bank_transfer', 22, 3),
      (10, 15000, 'bank_transfer', 24, 4),
      (12, 15000, 'cash',          17, 5),
      (8,   6000, 'cash',          10, 6),
      (3,   9000, 'bank_transfer',  6, 7)
    ) as p(k, cents, method, ago, receipt)
    join public.payment_requests pr on pr.organization_id = v_org and pr.reference_number = p.k;

  update public.payment_requests pr
     set paid_at = (select max(p.received_at) from public.payments p where p.payment_request_id = pr.id and p.status = 'received')
   where pr.organization_id = v_org and pr.status = 'paid';

  -- Attendance. Saturday Kids Club: the three Saturdays behind us, with one
  -- child away twice. Art Club: every Wednesday so far except the last one,
  -- which is left for the visitor to mark. Last term: all marked.
  select max(s.session_date) into v_wed from public.sessions s where s.term_id = v_t2 and s.session_date < v_today;

  insert into public.attendance (registration_id, session_id, status, marked_by, marked_at)
  select r.id, s.id,
         case
           when r.reference_code = 'HKD-0004' and s.session_date > v_start then 'absent'
           when r.reference_code = 'HKD-0006' and s.session_date = v_start then 'late'
           when r.reference_code = 'HKD-0008' and s.session_date = v_start + 7 then 'excused'
           when r.term_id in (v_t1p, v_t2p) and (r.id + extract(doy from s.session_date)::integer) % 9 = 0 then 'absent'
           else 'present'
         end,
         'Demo coach', (s.session_date + time '12:00') at time zone 'America/Nassau'
    from public.registrations r
    join public.sessions s on s.term_id = r.term_id and s.program_id = r.program_id
   where r.organization_id = v_org
     and r.registration_status = 'confirmed'
     and s.session_date < v_today
     and (r.term_id <> v_t2 or s.session_date < v_wed);

  -- Visits to the page over the last five weeks, by where they came from.
  insert into public.page_events (organization_id, path, event, source_channel, created_at)
  select v_org, v_path, 'view',
         (array['instagram', 'portpass_listing', 'google', 'whatsapp', 'qr', 'instagram', 'referral', 'unknown'])[1 + (g % 8)],
         v_now - make_interval(days => g % 35, hours => g % 11)
    from generate_series(1, 210) as g;
  insert into public.page_events (organization_id, path, event, source_channel, created_at)
  select v_org, v_path, e.event,
         (array['instagram', 'portpass_listing', 'whatsapp', 'qr', 'google'])[1 + (g % 5)],
         v_now - make_interval(days => g % 30, hours => g % 7)
    from (values ('whatsapp_click', 28), ('register_click', 34), ('register_start', 20)) as e(event, total)
   cross join lateral generate_series(1, e.total) as g;

  return v_org;
end;
$$;

revoke all on function public.reset_demo_business() from public, anon, authenticated;

comment on function public.reset_demo_business() is
  'Puts the demo business (/demo) back to its starting point: example registrations, payment requests, attendance and page visits, dated from today. Run nightly and by the "Reset demo" button.';
