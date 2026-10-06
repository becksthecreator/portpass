-- The WeddingWire widgets stop being stored as HTML (security review of
-- PR #183).
--
-- Bahamas Weddings By The Sea's page showed its WeddingWire rating badge,
-- award badge and reviews from three HTML snippets in this row, saved from
-- the Wedding Desk content screen and run, scripts included, as PortPass on
-- the public page. Any Wedding Desk account could replace them. From here
-- the row holds only what the snippets were made of: the WeddingWire member
-- ID (digits) and which of the three widgets to show. lib/weddingWire.ts
-- builds each snippet from a fixed template, byte for byte the embed code
-- 202609241015 stored.
--
-- 1. The new shape. The member ID is digits only, at most 12, with no
--    leading zero (the same rule as lib/weddingWire.ts), and a widget can
--    only be switched on with a member ID to build it from.
--
-- 2. Today's values move across: the member ID from the WeddingWire call in
--    each stored snippet, and a widget is shown when its snippet carried
--    that call. If the snippets named different member IDs this stops
--    rather than pick one.
--
-- 3. The three HTML columns are replaced by read-only columns that the
--    database builds from the new shape, with the same template. This
--    migration is applied before the code that reads the new shape merges
--    (previews and production share this database), so the page deployed
--    until then keeps rendering exactly what it does today, while nothing
--    can write HTML here any more: that code's save now fails until the new
--    code is live. Nothing in the new code reads these columns; a later
--    migration drops them once it is deployed.
--
--    Nothing stored is dropped unseen. The new columns are built beside the
--    stored ones first, and if any stored snippet is not byte for byte what
--    the template builds (someone changed it through the hole this closes,
--    or WeddingWire's embed code moved on), this stops before anything is
--    dropped, naming the column, so a person can look at it.
--
-- 4. RLS and grants as 202610180001 set them for this owner-only table,
--    restated: RLS on, no grant to the browser roles, and the always-false
--    restrictive policy.
--
-- Steps 2 and 3 run only while the snippets are still stored as text, so
-- running this file again changes nothing.

-- 1 -------------------------------------------------------------- the shape
alter table public.wedding_site_settings
  add column if not exists weddingwire_member_id text,
  add column if not exists show_rating_badge boolean not null default false,
  add column if not exists show_award_badge boolean not null default false,
  add column if not exists show_reviews_widget boolean not null default false;

-- 2 ------------------------------------------------------------- the values
do $$
declare
  stored record;
  rating_id text;
  award_id text;
  reviews_id text;
  member_id text;
begin
  if exists (select 1 from pg_attribute where attrelid = 'public.wedding_site_settings'::regclass and attname = 'rating_badge_html' and attgenerated = 's') then
    return;
  end if;
  select rating_badge_html, award_badge_html, reviews_widget_html into stored
    from public.wedding_site_settings where id = 1;
  if not found then
    return;
  end if;
  rating_id := substring(stored.rating_badge_html from $re$wpShowRatedWW\('([1-9][0-9]{0,11})'\)$re$);
  award_id := substring(stored.award_badge_html from $re$wpShowRatedWAv3\('([1-9][0-9]{0,11})',$re$);
  reviews_id := substring(stored.reviews_widget_html from $re$wpShowReviews\(([1-9][0-9]{0,11}),$re$);
  member_id := coalesce(rating_id, award_id, reviews_id);
  if rating_id <> member_id or award_id <> member_id or reviews_id <> member_id then
    raise exception 'wedding_site_settings: the stored WeddingWire snippets name different member IDs (%, %, %). Settle which is right, then run this again.',
      rating_id, award_id, reviews_id;
  end if;
  update public.wedding_site_settings set
    weddingwire_member_id = member_id,
    show_rating_badge = rating_id is not null,
    show_award_badge = award_id is not null,
    show_reviews_widget = reviews_id is not null
  where id = 1;
end;
$$;

alter table public.wedding_site_settings
  drop constraint if exists wedding_site_settings_weddingwire_member_id,
  add constraint wedding_site_settings_weddingwire_member_id
    check (weddingwire_member_id ~ '^[1-9][0-9]{0,11}$'),
  drop constraint if exists wedding_site_settings_weddingwire_needs_id,
  add constraint wedding_site_settings_weddingwire_needs_id
    check (weddingwire_member_id is not null or not (show_rating_badge or show_award_badge or show_reviews_widget));

comment on column public.wedding_site_settings.weddingwire_member_id is 'The business''s WeddingWire member ID, digits only. lib/weddingWire.ts builds the rating badge, award badge and reviews from it; no HTML is stored.';
comment on column public.wedding_site_settings.show_rating_badge is 'Show the WeddingWire rating badge (built from weddingwire_member_id).';
comment on column public.wedding_site_settings.show_award_badge is 'Show the WeddingWire Couples'' Choice Award badge (built from weddingwire_member_id).';
comment on column public.wedding_site_settings.show_reviews_widget is 'Show the WeddingWire reviews (built from weddingwire_member_id).';

-- 3 ----------------------------------------------- read-only, until dropped
-- One block, so however this file is run nothing is dropped after a failed
-- check: the read-only columns are built beside the stored ones, the block
-- stops unless every stored snippet is exactly what they build (leaving the
-- snippets in the row for whoever looks), and only then swaps them in.
do $$
declare
  differ text[];
begin
  if exists (select 1 from pg_attribute where attrelid = 'public.wedding_site_settings'::regclass and attname = 'rating_badge_html' and attgenerated = 's') then
    return;
  end if;

  alter table public.wedding_site_settings
    add column if not exists rating_badge_html_built text generated always as (
      case when show_rating_badge and weddingwire_member_id is not null then
'<script src="https://cdn1.weddingwire.com/_js/wp-rated.js?v=4"></script>
<a target="_blank" id="wp-rated-img" rel="nofollow"
   href="https://www.weddingwire.com/biz/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html"
   title="Reviewed on WeddingWire">
  <span id="wp-rated-reviews"></span>
</a>
<script>wpShowRatedWW(''' || weddingwire_member_id || ''');</script>'
      end
    ) stored,
    add column if not exists award_badge_html_built text generated always as (
      case when show_award_badge and weddingwire_member_id is not null then
'<div id="wp-ratedWA">
  <a target="_blank" rel="nofollow"
     href="https://www.weddingwire.com/biz/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html"
     title="WeddingWire Couples'' Choice Award Winner 2026">
    <img width="125" height="125" alt="Bahamas Weddings By The Sea"
         id="wp-ratedWA-img-2026"
         src="https://cdn1.weddingwire.com/img/badges/2026/badge-weddingawards_en_US.png">
  </a>
</div>
<script type="text/javascript" src="https://cdn1.weddingwire.com/_js/wp-rated.js?v=4"></script>
<script>wpShowRatedWAv3(''' || weddingwire_member_id || ''',''2026'');</script>'
      end
    ) stored,
    add column if not exists reviews_widget_html_built text generated always as (
      case when show_reviews_widget and weddingwire_member_id is not null then
'<script src="https://cdn1.weddingwire.com/js/wp-widget.js?symfnw-US248-1-20260923-006-1_www_m_"></script>
<div id="wp-widget-reviews">
  <div id="wp-widget-preview">
    Read <a href="https://www.weddingwire.com/reviews/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html" rel="nofollow">View reviews:</a> in &nbsp;
    <a href=''https://www.weddingwire.com'' rel="nofollow">
      <img src="https://cdn1.weddingwire.com/assets/img/logos/gen_logoHeader.svg" height="20">
    </a>
  </div>
</div>
<script>wpShowReviews(' || weddingwire_member_id || ', "red");</script>'
      end
    ) stored;

  select array_remove(array[
    case when s.rating_badge_html is distinct from s.rating_badge_html_built then 'rating_badge_html' end,
    case when s.award_badge_html is distinct from s.award_badge_html_built then 'award_badge_html' end,
    case when s.reviews_widget_html is distinct from s.reviews_widget_html_built then 'reviews_widget_html' end
  ], null) into differ
  from public.wedding_site_settings s where s.id = 1;
  if cardinality(differ) > 0 then
    raise exception 'wedding_site_settings: % not what lib/weddingWire.ts builds from the member ID. Nothing was dropped; compare by hand before running this again.',
      array_to_string(differ, ', ');
  end if;

  alter table public.wedding_site_settings
    drop column rating_badge_html,
    drop column award_badge_html,
    drop column reviews_widget_html;
  alter table public.wedding_site_settings rename column rating_badge_html_built to rating_badge_html;
  alter table public.wedding_site_settings rename column award_badge_html_built to award_badge_html;
  alter table public.wedding_site_settings rename column reviews_widget_html_built to reviews_widget_html;
end;
$$;

comment on column public.wedding_site_settings.rating_badge_html is 'Read-only: built from weddingwire_member_id and show_rating_badge (202610190002) for code deployed before that migration. The current code never reads it; dropped once that code is gone.';
comment on column public.wedding_site_settings.award_badge_html is 'Read-only: built from weddingwire_member_id and show_award_badge (202610190002) for code deployed before that migration. The current code never reads it; dropped once that code is gone.';
comment on column public.wedding_site_settings.reviews_widget_html is 'Read-only: built from weddingwire_member_id and show_reviews_widget (202610190002) for code deployed before that migration. The current code never reads it; dropped once that code is gone.';

-- 4 ---------------------------------------------------------- RLS, grants
alter table public.wedding_site_settings enable row level security;
revoke all on public.wedding_site_settings from anon, authenticated;
drop policy if exists wedding_site_settings_browser_roles_denied on public.wedding_site_settings;
create policy wedding_site_settings_browser_roles_denied on public.wedding_site_settings
  as restrictive for all to anon, authenticated using (false) with check (false);
