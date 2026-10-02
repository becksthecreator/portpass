-- SEO foundations (brief 11).
--
-- 1. A business's Google Business Profile link. Shown on its page as one of
--    the places it can be found, and used for the "Ask for a Google review"
--    link the business sends to a customer itself, one at a time.
alter table public.organizations add column if not exists google_business_url text;
alter table public.organizations drop constraint if exists organizations_google_business_url_format;
alter table public.organizations add constraint organizations_google_business_url_format
  check (google_business_url is null or (length(google_business_url) <= 300 and google_business_url ~ '^https://([a-z0-9-]+\.)*(google\.com|g\.page|goo\.gl)(/|$)'));

-- 2. When a business's details last changed, so the sitemap's lastmod is
--    true rather than "now" on every request.
alter table public.organizations add column if not exists updated_at timestamptz not null default now();

create or replace function public.organizations_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.organizations_touch_updated_at() from public, anon, authenticated;

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute function public.organizations_touch_updated_at();
