-- Missed in the previous migration: ProofBlock had nothing to render on
-- the new templated page because years_in_business/rating/review_count/
-- awards were never copied from wedding_site_settings onto the
-- organizations row (the PortPass listing page reads those from
-- wedding_site_settings directly, a separate data source this new page
-- doesn't touch). Values match the live wedding_site_settings row.
update public.organizations set
  years_in_business = 26,
  rating = 5.0,
  review_count = 100,
  awards = array_fill('Couples'' Choice Award'::text, array[6])
where slug = 'bahamas-weddings';
