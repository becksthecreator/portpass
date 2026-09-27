-- Entertainment now has three coming-soon subsections (Events, DJs, Sound
-- Equipment -- decided 27 Sept; Events is no longer a top-level section),
-- and the Carv card on /sports-fitness gets a "get notified" form, so the
-- interest form needs more categories than the original three. Widened
-- rather than dropped: the check still catches a typo'd category. Mirrors
-- lib/interestCategories.ts -- change both together.
alter table public.interest_submissions
  drop constraint if exists interest_submissions_category_check;

alter table public.interest_submissions
  add constraint interest_submissions_category_check
  check (category in (
    'venues',
    'events',
    'entertainment',
    'djs',
    'sound-equipment',
    'sports-fitness',
    'weddings',
    'tours'
  ));
