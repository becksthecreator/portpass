-- The three read-only WeddingWire HTML columns go (the follow-up
-- 202610270001 promised).
--
-- 202610270001 replaced rating_badge_html, award_badge_html and
-- reviews_widget_html with columns the database built from the member ID and
-- the three switches, so the code deployed before PR #185 kept reading the
-- same HTML until #185 went live. Since then nothing reads them: the page
-- and the Wedding Desk build each snippet in lib/weddingWire.ts.
--
-- Only built columns are dropped. If any of the three still holds stored
-- HTML (202610270001 never ran here), this stops with nothing dropped.
-- Running it again changes nothing.

do $$
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.wedding_site_settings'::regclass
      and attname in ('rating_badge_html', 'award_badge_html', 'reviews_widget_html')
      and not attisdropped
      and attgenerated <> 's'
  ) then
    raise exception 'wedding_site_settings: a WeddingWire HTML column still holds stored HTML. Run 202610270001 first; nothing was dropped.';
  end if;
end;
$$;

alter table public.wedding_site_settings
  drop column if exists rating_badge_html,
  drop column if exists award_badge_html,
  drop column if exists reviews_widget_html;
