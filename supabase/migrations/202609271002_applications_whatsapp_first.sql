-- /apply is WhatsApp-first for the OWN Conference: name, business name,
-- section, WhatsApp number, Instagram (optional) and one free-text line.
-- The early-access questionnaire fields become optional rather than being
-- dropped -- the existing rows keep their answers and the admin view still
-- shows them when present. UTM tags are captured per row so the QR short
-- link (/own) can be measured.
alter table public.applications
  alter column email drop not null,
  alter column phone drop not null,
  alter column activity_type drop not null,
  alter column main_location drop not null,
  alter column player_count drop not null,
  alter column help_needed drop not null,
  alter column description drop not null;

alter table public.applications
  add column if not exists section text,
  add column if not exists whatsapp_e164 text,
  add column if not exists instagram_handle text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

-- Approving one of these applications creates an organizations row, and a
-- WhatsApp-first application has no email, activity type or location to
-- copy across. These were NOT NULL only because the original form always
-- collected them.
alter table public.organizations
  alter column primary_contact drop not null,
  alter column email drop not null,
  alter column phone drop not null,
  alter column activity_type drop not null,
  alter column main_location drop not null;
