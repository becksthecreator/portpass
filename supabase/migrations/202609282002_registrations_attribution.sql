-- Futprep growth tracking, part 1 (28 Sept brief): where every family came
-- from, so the Founding Partner "Grow With Us" commission (8% on new
-- families PortPass brings, capped per term) can be proven line by line.
-- Handbook v1.3 §5: commissionable only if a NEW family (not in an earlier
-- registration, not a sibling of one) registered through PortPass with a
-- source recorded. When in doubt, not commissionable -- which is why the
-- flags are computed at submit time by the server and never by the form.

alter table public.registrations
  add column if not exists source_channel text not null default 'unknown'
    check (source_channel in ('portpass_listing','portpass_link','qr','instagram','google','whatsapp','referral','member_perk','word_of_mouth','school','other','unknown')),
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  -- Host only (e.g. "instagram.com"), never a full referrer URL.
  add column if not exists referrer_host text,
  add column if not exists referral_code text,
  -- The parent's own answer to "How did you hear about Futprep?".
  add column if not exists heard_about_us text,
  add column if not exists is_new_family boolean,
  add column if not exists commission_eligible boolean not null default false,
  add column if not exists commission_reason text;

-- Family matching: the same parent phone or email anywhere in the
-- organization's registrations means a returning family (siblings included).
create index if not exists registrations_family_phone_idx
  on public.registrations (organization_id, parent_phone) where parent_phone is not null;
create index if not exists registrations_family_email_idx
  on public.registrations (organization_id, parent_email) where parent_email is not null;

-- Backfill: everyone registered before this migration is a Term 1 founding
-- family. Never commissionable. Re-runnable (only rows with no reason yet).
update public.registrations
   set is_new_family = false,
       commission_eligible = false,
       commission_reason = 'Term 1 founding family'
 where commission_reason is null;
