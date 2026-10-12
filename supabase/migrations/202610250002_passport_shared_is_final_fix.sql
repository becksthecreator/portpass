-- Brief 31 (D, second reviews): "shared is final", fixed and closed.
--
-- 1. The fix. passport_shared_is_final() read new.note in the same IF as
--    its table check, and PL/pgSQL looks the field up even on
--    passport_marks, which has no note: a change to a shared passport's
--    marks failed with a field error instead of PASSPORT_SHARED. The note
--    check is now nested, so it only reads note fields on passport_notes.
-- 2. The gaps. On a shared passport, a mark or note can no longer be
--    deleted, nor moved off it or onto it (the old passport is checked as
--    well as the new one); and a shared passport's child, band, business
--    and sharing details don't change.
-- 3. Still allowed, as before: taking a clip down (photo permission
--    withdrawn), a next step cleared when its offering is deleted, and
--    everything going when its registration, request, skill or passport
--    is deleted (cascaded deletes come from another trigger, so they run
--    one level down).
--
-- Only the service role writes these tables; the app never changes a
-- shared passport. Nothing is deleted or rewritten by this migration.
--
-- Switch back: run the function and the two trigger definitions from
-- 202610250001_futprep_passports.sql again (marks and notes triggers
-- "before insert or update").

create or replace function public.passport_shared_is_final()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old text;
  v_new text;
begin
  if tg_table_name = 'passports' then
    if old.status = 'shared' and (
         new.status is distinct from old.status
      or new.registration_id is distinct from old.registration_id
      or new.private_session_request_id is distinct from old.private_session_request_id
      or new.band is distinct from old.band
      or new.organization_id is distinct from old.organization_id
      or new.shared_at is distinct from old.shared_at
      or new.shared_by is distinct from old.shared_by) then
      raise exception 'PASSPORT_SHARED' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- passport_marks and passport_notes.
  if tg_op = 'DELETE' then
    -- A cascade from a deleted registration, request, skill or passport.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    select status into v_old from public.passports where id = old.passport_id;
    if v_old is distinct from 'shared' then
      return old;
    end if;
    raise exception 'PASSPORT_SHARED' using errcode = 'P0001';
  end if;

  select status into v_new from public.passports where id = new.passport_id;
  if tg_op = 'UPDATE' then
    select status into v_old from public.passports where id = old.passport_id;
  end if;
  if v_new is distinct from 'shared' and v_old is distinct from 'shared' then
    return new;
  end if;

  -- A shared passport's note row: only a clip taken down, or a next step
  -- cleared, on the same passport.
  if tg_table_name = 'passport_notes' and tg_op = 'UPDATE' then
    if new.passport_id = old.passport_id
       and new.note = old.note
       and (new.clip_url is null or new.clip_url is not distinct from old.clip_url)
       and (new.next_step_offering_id is null or new.next_step_offering_id is not distinct from old.next_step_offering_id) then
      return new;
    end if;
  end if;
  raise exception 'PASSPORT_SHARED' using errcode = 'P0001';
end;
$$;

drop trigger if exists passport_marks_shared_is_final on public.passport_marks;
create trigger passport_marks_shared_is_final before insert or update or delete on public.passport_marks
  for each row execute function public.passport_shared_is_final();
drop trigger if exists passport_notes_shared_is_final on public.passport_notes;
create trigger passport_notes_shared_is_final before insert or update or delete on public.passport_notes
  for each row execute function public.passport_shared_is_final();

revoke all on function public.passport_shared_is_final() from public, anon, authenticated;
