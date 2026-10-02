-- SEO foundations (brief 11).
--
-- 1. A business's Google Business Profile link. Shown on its page as one of
--    the places it can be found, and used for the "Ask for a Google review"
--    link the business sends to a customer itself, one at a time.
alter table public.organizations add column if not exists google_business_url text;
alter table public.organizations drop constraint if exists organizations_google_business_url_format;
alter table public.organizations add constraint organizations_google_business_url_format
  check (google_business_url is null or (length(google_business_url) <= 300 and google_business_url ~ '^https://([a-z0-9-]+\.)*(google\.com|g\.page|goo\.gl)(/|$)'));

-- 2. When a business's page last changed, so the sitemap's lastmod is
--    true rather than "now" on every request. It moves when something the
--    page shows changes: one of the columns below, or (section 3) its
--    offerings, questions, photos, sections, shop or perks. A change to
--    anything private (bank details, licences, review notes, claim dates)
--    leaves it where it was.
alter table public.organizations add column if not exists updated_at timestamptz not null default now();

create or replace function public.organizations_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  shown constant text[] := array[
    'name', 'slug', 'theme', 'registration_url', 'primary_category', 'subcategory', 'island', 'area',
    'one_liner', 'description', 'years_in_business', 'rating', 'review_count', 'awards', 'owner_name',
    'owner_bio', 'owner_image_url', 'website_url', 'hero_image_url', 'is_published', 'brand_color',
    'logo_url', 'is_directory_listed', 'custom_domain', 'identity_layout', 'reviews_url',
    'reviews_platform', 'status', 'whatsapp_e164', 'public_email', 'instagram_handle',
    'payment_methods', 'photo_consent_required', 'google_business_url'
  ];
begin
  -- Set on purpose: a table the page shows changed (section 3).
  if new.updated_at is distinct from old.updated_at then
    return new;
  end if;
  if (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(to_jsonb(new)) where key = any(shown))
     is distinct from
     (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(to_jsonb(old)) where key = any(shown)) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.organizations_touch_updated_at() from public, anon, authenticated;

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute function public.organizations_touch_updated_at();

-- 3. The rest of a business's page lives in other tables: a change there
--    moves the business's updated_at too.
create or replace function public.touch_organization_from_page_table()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op <> 'INSERT' then
    update public.organizations set updated_at = now() where id = old.organization_id;
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.organization_id is distinct from old.organization_id) then
    update public.organizations set updated_at = now() where id = new.organization_id;
  end if;
  return null;
end;
$$;

revoke all on function public.touch_organization_from_page_table() from public, anon, authenticated;

do $$
declare
  page_table text;
begin
  foreach page_table in array array['offerings', 'organization_faqs', 'organization_images', 'organization_categories', 'products', 'drops', 'member_perks'] loop
    if to_regclass('public.' || page_table) is not null then
      execute format('drop trigger if exists %I on public.%I', page_table || '_touch_organization', page_table);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.touch_organization_from_page_table()', page_table || '_touch_organization', page_table);
    end if;
  end loop;
end;
$$;

-- 4. Page views for the Admin Overview, counted in the database: the
--    week's total and the most viewed pages, in one query however many
--    views there were.
create index if not exists page_events_view_created_idx on public.page_events (created_at) where event = 'view';

create or replace function public.site_visit_counts(since timestamptz, top_n integer default 5)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with views as (
    select e.path from public.page_events e where e.event = 'view' and e.created_at >= since
  ), top as (
    select v.path, count(*)::bigint as views from views v group by v.path order by count(*) desc, v.path limit greatest(least(top_n, 50), 0)
  )
  select jsonb_build_object(
    'views', (select count(*) from views),
    'topPages', coalesce((select jsonb_agg(jsonb_build_object('path', t.path, 'views', t.views) order by t.views desc, t.path) from top t), '[]'::jsonb)
  );
$$;

revoke all on function public.site_visit_counts(timestamptz, integer) from public, anon, authenticated;
