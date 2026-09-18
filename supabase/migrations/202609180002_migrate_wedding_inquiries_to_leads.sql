-- Migrate the one existing wedding_inquiries row into wedding_leads before
-- dropping the old table. idempotency_key is synthesized (none existed at
-- original submission time) and contact_consent is set true since this
-- person already actively submitted a full consultation request.
insert into public.wedding_leads (
  idempotency_key, names, email, phone, travel_origin, ceremony_type,
  preferred_wedding_date, arrival_date, guest_count, location_idea,
  venue_preference, requested_services, consultation_method,
  consultation_preferred_date, consultation_preferred_time,
  consultation_time_zone, notes, contact_consent, marketing_consent,
  status, created_at
)
select
  'migrated-wedding-inquiry-' || id,
  trim(concat_ws(' & ', partner_one_name, partner_two_name)),
  contact_email,
  contact_phone,
  travelling_from,
  ceremony_style,
  nullif(wedding_date_preference, '')::date,
  nullif(arrival_date, '')::date,
  guest_count_estimate,
  location_idea,
  venue_preference,
  to_jsonb(coalesce(services_wanted, '{}')),
  case consultation_preference
    when 'Consultation call' then 'phone'
    when 'WhatsApp video consultation' then 'whatsapp_video'
    when 'Guided text planning' then 'guided_text'
    else null
  end,
  nullif(consultation_date, '')::date,
  nullif(consultation_time, '')::time,
  consultation_timezone,
  notes,
  true,
  false,
  case when status in ('new','pre_consultation','consultation_requested','planning','ready_for_antonio','antonio_review','quoted','booked','closed') then status else 'new' end,
  created_at
from public.wedding_inquiries;
