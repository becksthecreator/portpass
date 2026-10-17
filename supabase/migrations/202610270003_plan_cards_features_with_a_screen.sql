-- The public plan cards list only what has a screen (growth plan, 16 Oct
-- 2026). Availability, Packages, Per-staff reporting and Priority support
-- were promised on the Solo, Growing and Business cards and have no screen
-- behind them, so they come off the cards and the comparison table, not
-- get built. Antonio chose a migration (17 Oct) so every database matches.
--
-- By plan code. Only those four words are removed: anything a founder has
-- added or reworded on the Prices screen stays, in its order. Running it
-- again changes nothing.

update public.pricing_plans
   set features = features - array['Availability', 'Packages', 'Per-staff reporting', 'Priority support'],
       updated_at = now()
 where code in ('solo', 'growing', 'business')
   and features ?| array['Availability', 'Packages', 'Per-staff reporting', 'Priority support'];
