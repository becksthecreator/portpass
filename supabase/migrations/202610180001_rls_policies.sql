-- Brief 21, part B: row level security policies for every public table.
--
-- Until now every public table had RLS switched on and no policy: deny-all
-- for the browser roles (anon, authenticated), with every read and write
-- going through the service role in server code. Safe by default, but with
-- no second line: a server bug that handed a browser key to the wrong
-- query would have found tables whose grants were still open (eleven of
-- them could be written by anon, had any policy let it). This migration
-- gives every table a deliberate policy, takes every write grant away from
-- the browser roles, and makes the default for new tables "no browser
-- grants at all".
--
-- Three classes. The class is the whole policy; a table is in exactly one.
--
--   public-read     Rows the public site shows anyway. anon and
--                   authenticated may SELECT, only the public columns, only
--                   where the row is published and belongs to a published,
--                   non-demo organisation (or the table has no organisation).
--                   No INSERT, UPDATE or DELETE for either role.
--
--     organizations, offerings, organization_faqs, organization_images,
--     organization_categories, locations, pricing_plans, pricing_addons,
--     events, venues, products, product_variants, drops, drop_items,
--     categories, guides, guide_listings, wedding_packages,
--     wedding_gallery_images
--
--   owner-only      A business's own records, shown to that business's
--                   authorised staff through the server (and, for health
--                   fields, only behind the team permission). No browser
--                   role may read or write a row; the service role does.
--
--     attendance, audit_log, booking_requests, coach_availability,
--     coach_profiles, drop_waitlist, event_tickets, futprep_return_links,
--     guardianships, member_pass_checks, member_perks, message_log,
--     organization_invites, organization_payment_settings, page_events,
--     payment_requests, payments, people, perk_redemptions,
--     private_session_events, private_session_requests, program_terms,
--     programs, registration_edits, registrations, reservations,
--     session_plans, session_staff, sessions, shops, staff_members,
--     staff_work_logs, wedding_lead_notes, wedding_leads,
--     wedding_site_settings, wedding_unavailable_dates
--
--     (session_plans and staff_work_logs are made by 202609010002 and exist
--     in a fresh stack; the project's own database no longer has them.)
--
--   platform-only   PortPass's own books and tools. Founders only, through
--                   the server. No browser role may read or write a row.
--
--     admin_links, applications, billing_accounts, billing_events,
--     billing_reminders, commission_plans, interest_submissions, job_runs,
--     leads, organization_claim_links, portpass_invoice_counters,
--     portpass_invoice_lines, portpass_invoices, portpass_receipts,
--     scout_lookups, site_content, site_errors, sponsors,
--     staff_login_attempts
--
--   Two tables the brief listed as public-read are platform-only here:
--   sponsors (Admin -> Leads -> Sponsors: what a sponsor gives, its value
--   and internal notes; nothing on the public site reads it) and
--   site_content (operational records such as the backup heartbeat and the
--   last admin sign-in; its own comment says server-side reads only).
--
--   profiles and organization_members keep the policies they have had
--   since accounts_core (a signed-in person reads their own row and their
--   own memberships). They are not changed here.
--
-- "No browser role may read or write" is written down twice for each
-- owner-only and platform-only table: the grants are revoked, and a
-- RESTRICTIVE policy that is always false is attached for anon and
-- authenticated. The policy is what the security advisor counts
-- (rls_enabled_no_policy), and it is what keeps the table shut even if a
-- later migration adds a permissive policy by mistake: a restrictive policy
-- must also pass, and this one never does.
--
-- events and event_tickets exist in the project's database but were made
-- by hand, before migrations: every statement about them checks that they
-- exist first, so a fresh local stack (CI) runs this file too.

-- ----------------------------------------------------------- the default
-- A table, function or sequence made from now on starts with no grant to
-- the browser roles. Supabase's own default is "grant all"; that is how
-- the eleven writable tables came about.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ------------------------------------------------------------ the helper
-- Which organisations the public may see: published, and not the demo
-- business. SECURITY DEFINER so a policy on a child table can ask without
-- the asking row itself needing to pass organizations' policy; it answers
-- yes or no about one id and nothing else. In the private schema so it has
-- no REST endpoint.
grant usage on schema private to anon;

create or replace function private.public_organization(org_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organizations o
     where o.id = org_id and o.is_published and not o.is_demo
  )
$$;
revoke all on function private.public_organization(bigint) from public;
grant execute on function private.public_organization(bigint) to anon, authenticated;

-- ------------------------------------------------- owner-only, platform-only
do $$
declare
  t text;
begin
  foreach t in array array[
    -- owner-only
    'attendance', 'audit_log', 'booking_requests', 'coach_availability', 'coach_profiles',
    'drop_waitlist', 'event_tickets', 'futprep_return_links', 'guardianships',
    'member_pass_checks', 'member_perks', 'message_log', 'organization_invites',
    'organization_payment_settings', 'page_events', 'payment_requests', 'payments', 'people',
    'perk_redemptions', 'private_session_events', 'private_session_requests', 'program_terms',
    'programs', 'registration_edits', 'registrations', 'reservations', 'session_plans',
    'session_staff', 'sessions', 'shops', 'staff_members', 'staff_work_logs',
    'wedding_lead_notes', 'wedding_leads', 'wedding_site_settings', 'wedding_unavailable_dates',
    -- platform-only
    'admin_links', 'applications', 'billing_accounts', 'billing_events', 'billing_reminders',
    'commission_plans', 'interest_submissions', 'job_runs', 'leads', 'organization_claim_links',
    'portpass_invoice_counters', 'portpass_invoice_lines', 'portpass_invoices', 'portpass_receipts',
    'scout_lookups', 'site_content', 'site_errors', 'sponsors', 'staff_login_attempts'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'rls_policies: public.% does not exist here, skipped', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_browser_roles_denied', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      t || '_browser_roles_denied', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------ public-read
-- For each: writes revoked for both browser roles, SELECT granted on the
-- public columns only (a column that is not named here cannot be read
-- whatever the policy says), and one permissive SELECT policy saying which
-- rows. The row test matches what the public site itself shows.

-- organizations: the business page. Not the owner's own contact details
-- (email, phone, primary_contact), not bank_transfer_details, not the
-- founders' review and suspension notes, not licence records.
revoke all on public.organizations from anon, authenticated;
grant select (
  id, slug, name, primary_category, subcategory, island, area, one_liner, description,
  years_in_business, rating, review_count, awards, owner_name, owner_bio, owner_image_url,
  website_url, hero_image_url, brand_color, logo_url, custom_domain, identity_layout,
  reviews_url, reviews_platform, whatsapp_e164, phone_e164, public_email, instagram_handle,
  google_business_url, status, theme, photo_consent_required, payment_methods,
  is_published, is_directory_listed, is_demo, created_at, updated_at
) on public.organizations to anon, authenticated;
drop policy if exists organizations_public_read on public.organizations;
create policy organizations_public_read on public.organizations
  for select to anon, authenticated
  using (is_published and not is_demo);

-- offerings: every column is shown on the page.
revoke all on public.offerings from anon, authenticated;
grant select on public.offerings to anon, authenticated;
drop policy if exists offerings_public_read on public.offerings;
create policy offerings_public_read on public.offerings
  for select to anon, authenticated
  using (is_published and private.public_organization(organization_id));

revoke all on public.organization_faqs from anon, authenticated;
grant select on public.organization_faqs to anon, authenticated;
drop policy if exists organization_faqs_public_read on public.organization_faqs;
create policy organization_faqs_public_read on public.organization_faqs
  for select to anon, authenticated
  using (private.public_organization(organization_id));

revoke all on public.organization_images from anon, authenticated;
grant select on public.organization_images to anon, authenticated;
drop policy if exists organization_images_public_read on public.organization_images;
create policy organization_images_public_read on public.organization_images
  for select to anon, authenticated
  using (private.public_organization(organization_id));

revoke all on public.organization_categories from anon, authenticated;
grant select on public.organization_categories to anon, authenticated;
drop policy if exists organization_categories_public_read on public.organization_categories;
create policy organization_categories_public_read on public.organization_categories
  for select to anon, authenticated
  using (private.public_organization(organization_id));

revoke all on public.locations from anon, authenticated;
grant select on public.locations to anon, authenticated;
drop policy if exists locations_public_read on public.locations;
create policy locations_public_read on public.locations
  for select to anon, authenticated
  using (active and private.public_organization(organization_id));

-- pricing: the plans and add-ons the /pricing page shows.
revoke all on public.pricing_plans from anon, authenticated;
grant select on public.pricing_plans to anon, authenticated;
drop policy if exists pricing_plans_public_read on public.pricing_plans;
create policy pricing_plans_public_read on public.pricing_plans
  for select to anon, authenticated
  using (is_public and active);

revoke all on public.pricing_addons from anon, authenticated;
grant select on public.pricing_addons to anon, authenticated;
drop policy if exists pricing_addons_public_read on public.pricing_addons;
create policy pricing_addons_public_read on public.pricing_addons
  for select to anon, authenticated
  using (is_public);

-- events: live ones. Not the partner's name or revenue share.
do $$
begin
  if to_regclass('public.events') is null then
    raise notice 'rls_policies: public.events does not exist here, skipped';
    return;
  end if;
  execute 'alter table public.events enable row level security';
  execute 'revoke all on public.events from anon, authenticated';
  execute 'grant select (id, organization_id, venue_id, slug, series, edition_number, title, subtitle, status, visibility, event_date, doors_at, starts_at, ends_at, venue_name, venue_address, capacity, advance_price_cents, door_price_cents, currency, created_at, updated_at) on public.events to anon, authenticated';
  execute 'drop policy if exists events_public_read on public.events';
  execute 'create policy events_public_read on public.events for select to anon, authenticated using (visibility = ''live'' and (organization_id is null or private.public_organization(organization_id)))';
end $$;

-- venues: live, active ones. Not the partner contact, the commission or
-- the availability notes.
revoke all on public.venues from anon, authenticated;
grant select (
  id, organization_id, slug, name, area, short_description, description, hero_image_url,
  gallery, capacity_min, capacity_max, features, address, latitude, longitude,
  base_price_cents, currency, price_basis, booking_mode, visibility, wedding_eligible,
  categories, active, created_at, updated_at
) on public.venues to anon, authenticated;
drop policy if exists venues_public_read on public.venues;
create policy venues_public_read on public.venues
  for select to anon, authenticated
  using (visibility = 'live' and active and (organization_id is null or private.public_organization(organization_id)));

-- the shop: published products of a published business, their variants,
-- published drops and what is in them. Not who approved a licence, and
-- never a drop's followers_token (it is the followers-first link).
revoke all on public.products from anon, authenticated;
grant select (
  id, organization_id, slug, title, description, price_cents, photos, is_published, uses_marks,
  licence_kind, licence_note, licence_approved_at, sort_order, created_at, updated_at
) on public.products to anon, authenticated;
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated
  using (is_published and private.public_organization(organization_id));

revoke all on public.product_variants from anon, authenticated;
grant select on public.product_variants to anon, authenticated;
drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p
     where p.id = product_id and p.is_published and private.public_organization(p.organization_id)
  ));

revoke all on public.drops from anon, authenticated;
grant select (
  id, organization_id, slug, title, description, hero_image_url, opens_at, closes_at,
  followers_first_until, ready_on, pickup_note, delivery_note, allow_pickup, allow_delivery,
  delivery_zones, status, created_at, updated_at
) on public.drops to anon, authenticated;
drop policy if exists drops_public_read on public.drops;
create policy drops_public_read on public.drops
  for select to anon, authenticated
  using (status = 'published' and private.public_organization(organization_id));

revoke all on public.drop_items from anon, authenticated;
grant select on public.drop_items to anon, authenticated;
drop policy if exists drop_items_public_read on public.drop_items;
create policy drop_items_public_read on public.drop_items
  for select to anon, authenticated
  using (exists (
    select 1 from public.drops d
     where d.id = drop_id and d.status = 'published' and private.public_organization(d.organization_id)
  ));

-- the directory's sections and the founders' guides.
revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (is_visible);

revoke all on public.guides from anon, authenticated;
grant select (id, slug, title, description, body, status, published_at, updated_at, created_at) on public.guides to anon, authenticated;
drop policy if exists guides_public_read on public.guides;
create policy guides_public_read on public.guides
  for select to anon, authenticated
  using (status = 'published');

revoke all on public.guide_listings from anon, authenticated;
grant select on public.guide_listings to anon, authenticated;
drop policy if exists guide_listings_public_read on public.guide_listings;
create policy guide_listings_public_read on public.guide_listings
  for select to anon, authenticated
  using (
    exists (select 1 from public.guides g where g.id = guide_id and g.status = 'published')
    and private.public_organization(organization_id)
  );

-- the wedding site: live packages and live gallery photos.
revoke all on public.wedding_packages from anon, authenticated;
grant select on public.wedding_packages to anon, authenticated;
drop policy if exists wedding_packages_public_read on public.wedding_packages;
create policy wedding_packages_public_read on public.wedding_packages
  for select to anon, authenticated
  using (visibility = 'live');

revoke all on public.wedding_gallery_images from anon, authenticated;
grant select on public.wedding_gallery_images to anon, authenticated;
drop policy if exists wedding_gallery_images_public_read on public.wedding_gallery_images;
create policy wedding_gallery_images_public_read on public.wedding_gallery_images
  for select to anon, authenticated
  using (visibility = 'live');

-- ----------------------------------------------------------- the checks
-- Two more lines for Admin -> Health and the CI test
-- (db/adminHealth.integration.test.ts): a table with RLS on and no policy,
-- and a table a browser role could write. Both must stay at zero.
create or replace function public.admin_database_checks()
returns table (check_name text, problems bigint)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select 'tables_without_rls'::text, count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  union all
  select 'tables_with_rls_but_no_policy'::text, count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  union all
  select 'tables_browser_roles_can_write'::text, count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE')
          or has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE'))
  union all
  select 'functions_without_search_path'::text, count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 'definer_functions_open_to_browser_roles'::text, count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
$$;

revoke all on function public.admin_database_checks() from public, anon, authenticated;
