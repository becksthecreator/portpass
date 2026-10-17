-- After 202610220001 a new registration takes its place in a class under a
-- lock for that class and term (create_registration_within_cap). Two other
-- ways of giving out a place still counted and then wrote in separate
-- calls: the staff desk promoting a child from the waitlist (or bringing a
-- cancelled one back), and a business's "Confirm the place" button. Two
-- promotions at the same moment, or a promotion racing a parent's
-- registration, could put a class over its cap.
--
-- Now a status change goes through this function, which takes the SAME
-- lock, so places are given out one at a time whichever door gives them.
-- The app still works out the cap and passes it in, with the statuses
-- that take a place (ACTIVE_REGISTRATION_STATUSES in db/registrations.ts).
--
-- The cap is checked only when the change TAKES a place: the row's current
-- status does not take one (waitlist, cancelled, trial) and the new one
-- does. A child who already has a place is confirmed, re-opened or
-- cancelled freely. A refusal is an answer, not an error, and nothing is
-- written:
--
--   another business's row, or none   -> {"refused": "NOT_FOUND"}
--   the class is full                  -> {"refused": "PROGRAM_FULL"}
--   otherwise                          -> {"id": ..., "registration_status": <new>, "previous_status": <old>}

create or replace function public.set_registration_status_within_cap(
  p_registration_id bigint,
  p_organization_id bigint,
  p_status text,
  p_cap integer,
  p_active_statuses text[]
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
set lock_timeout = '10s'
as $$
declare
  v_program_id bigint;
  v_term_id bigint;
  v_current text;
begin
  if p_registration_id is null or p_organization_id is null or p_status is null
     or coalesce(cardinality(p_active_statuses), 0) = 0 then
    raise exception 'set_registration_status_within_cap: bad request';
  end if;

  select r.program_id, r.term_id into v_program_id, v_term_id
    from public.registrations r
   where r.id = p_registration_id and r.organization_id = p_organization_id;
  if v_program_id is null then
    return jsonb_build_object('refused', 'NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtext('registrations'), hashtext(v_program_id::text || ':' || v_term_id::text));

  -- Read the status again under the lock: another request may just have
  -- changed it.
  select r.registration_status into v_current
    from public.registrations r
   where r.id = p_registration_id and r.organization_id = p_organization_id;

  if p_status = any(p_active_statuses) and not (v_current = any(p_active_statuses)) then
    if p_cap is null or p_cap < 0 then
      raise exception 'set_registration_status_within_cap: bad request';
    end if;
    if (select count(*) from public.registrations r
         where r.program_id = v_program_id
           and r.term_id = v_term_id
           and r.registration_status = any(p_active_statuses)) >= p_cap then
      return jsonb_build_object('refused', 'PROGRAM_FULL');
    end if;
  end if;

  update public.registrations
     set registration_status = p_status
   where id = p_registration_id and organization_id = p_organization_id;

  return jsonb_build_object('id', p_registration_id, 'registration_status', p_status, 'previous_status', v_current);
end;
$$;

revoke all on function public.set_registration_status_within_cap(bigint, bigint, text, integer, text[]) from public, anon, authenticated;
grant execute on function public.set_registration_status_within_cap(bigint, bigint, text, integer, text[]) to service_role;

comment on function public.set_registration_status_within_cap(bigint, bigint, text, integer, text[]) is
  'Changes a registration''s status under the class''s lock, refusing a change that would take a place in a full class. Called by db/staff.ts and db/businessRegistrations.ts only.';
