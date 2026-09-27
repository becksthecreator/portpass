-- Supabase security advisor, 27 Sept (lint 0011, "function search_path
-- mutable"): the two publish-trigger functions ran with whatever
-- search_path the caller had, which is how a hostile schema earlier in the
-- path could shadow a table they reference. Pinning it closes that. Both
-- are zero-argument trigger functions (checked in pg_proc before writing
-- this).
alter function public.check_organization_publish_requires_priced_offering() set search_path = public, pg_temp;
alter function public.unpublish_organization_if_no_priced_offering() set search_path = public, pg_temp;
