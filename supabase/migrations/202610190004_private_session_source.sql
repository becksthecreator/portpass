-- Brief 29, part D: where a private-session request came from, as a
-- registration already records it (202609282002): the first-party
-- attribution cookie and the link's own tags. No identifiers, no address.
-- The booking link (/futprep/book?coach=...&utm_source=whatsapp) is what
-- makes this worth keeping: Futprep can see which links bring requests.
alter table public.private_session_requests
  add column if not exists source_channel text not null default 'unknown'
    check (source_channel in ('portpass_listing','portpass_link','qr','instagram','google','whatsapp','referral','member_perk','word_of_mouth','school','other','unknown')),
  add column if not exists utm_source text check (utm_source is null or length(utm_source) <= 80),
  add column if not exists utm_medium text check (utm_medium is null or length(utm_medium) <= 80),
  add column if not exists utm_campaign text check (utm_campaign is null or length(utm_campaign) <= 80),
  add column if not exists referrer_host text check (referrer_host is null or length(referrer_host) <= 120),
  add column if not exists via_portpass boolean not null default false;
