-- Staff can now create a registration knowing only the child's name and
-- program. Every field a parent would normally supply becomes genuinely
-- nullable so "not yet asked" (null) is distinguishable from "asked, and
-- the answer was none" (empty string / explicit value) -- the whole point
-- of pending_details is that a coach must never mistake one for the other.
alter table public.registrations
  alter column parent_name drop not null,
  alter column parent_email drop not null,
  alter column parent_phone drop not null,
  alter column relationship drop not null,
  alter column child_dob drop not null,
  alter column gender drop not null,
  alter column emergency_contact_name drop not null,
  alter column emergency_contact_phone drop not null,
  alter column allergies drop not null,
  alter column medical_conditions drop not null,
  alter column medications drop not null,
  alter column special_needs drop not null,
  alter column authorized_pickup drop not null,
  alter column photo_consent drop not null,
  alter column signature_name drop not null,
  alter column consent_at drop not null,
  alter column payment_method drop not null;

alter table public.registrations
  drop constraint registrations_registration_status_check,
  add constraint registrations_registration_status_check
    check (registration_status = any (array['pending_details','pending','confirmed','cancelled']));
