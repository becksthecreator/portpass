-- Two gaps left open by the reviews of #200-#222 (STATE, "Left open"):
--
-- 1. Moving a child to another class from the staff desk's record
--    (db/staff.ts updateFutprepRegistrationDetail) wrote the new class
--    straight onto the row, with no count, so a move could put the new
--    class over its cap. Now the move goes through
--    move_registration_within_cap, which takes the lock of BOTH classes,
--    the one the child leaves and the one they join (the same lock key as
--    create_registration_within_cap and set_registration_status_within_cap),
--    and is refused when the child holds a place and the new class is full.
--
-- 2. A child could get free tasters in two classes at the same moment: the
--    "already had a taster" check (TRIAL_ALREADY_USED) looks across the
--    business, but the lock it ran under was one class's. Now a taster
--    also takes a lock for the business's tasters, before the class's, so
--    two taster requests for one business are answered one at a time.
--
-- And, because a child can now change class (Security & QA on #293):
-- set_registration_status_within_cap read the child's class before taking
-- its lock and never again, so a status change racing a move could count
-- the class the child was leaving. Now both the move and the status change
-- lock the registration's row first (select ... for update), so its class
-- can't change under them, and then take their class lock(s).
--
-- Lock order, so nothing can deadlock: a taster takes the business lock,
-- then one class lock. A status change takes the row, then its one class
-- lock. A move takes the row, then its two class locks in ascending key
-- order. Nothing that holds a class lock waits for a registration row
-- another request holds (inserts and counts lock no existing row).
--
-- Refusals are answers, not errors, and nothing is written:
--   move: another business's row, programme or term, or no row -> {"refused": "NOT_FOUND"}
--         the new class is full                                -> {"refused": "PROGRAM_FULL"}
--         otherwise -> {"id", "program_id", "term_id", "previous_program_id", "previous_term_id"}

create or replace function public.move_registration_within_cap(
  p_registration_id bigint,
  p_organization_id bigint,
  p_program_id bigint,
  p_term_id bigint,
  p_cap integer,
  p_active_statuses text[]
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
set lock_timeout = '10s'
as $$
declare
  v_status text;
  v_program_id bigint;
  v_term_id bigint;
  v_old_key integer;
  v_new_key integer := hashtext(p_program_id::text || ':' || p_term_id::text);
begin
  if p_registration_id is null or p_organization_id is null or p_program_id is null or p_term_id is null
     or coalesce(cardinality(p_active_statuses), 0) = 0 then
    raise exception 'move_registration_within_cap: bad request';
  end if;

  -- The programme and the term belong to this business.
  if not exists (select 1 from public.programs p where p.id = p_program_id and p.organization_id = p_organization_id)
     or not exists (select 1 from public.program_terms t where t.id = p_term_id and t.program_id = p_program_id) then
    return jsonb_build_object('refused', 'NOT_FOUND');
  end if;

  -- The row first: its class can't change until this call ends.
  select r.registration_status, r.program_id, r.term_id into v_status, v_program_id, v_term_id
    from public.registrations r
   where r.id = p_registration_id and r.organization_id = p_organization_id
     for update;
  if not found then
    return jsonb_build_object('refused', 'NOT_FOUND');
  end if;

  -- Then both classes, lower key first.
  v_old_key := hashtext(v_program_id::text || ':' || v_term_id::text);
  perform pg_advisory_xact_lock(hashtext('registrations'), least(v_old_key, v_new_key));
  if v_old_key <> v_new_key then
    perform pg_advisory_xact_lock(hashtext('registrations'), greatest(v_old_key, v_new_key));
  end if;

  if (v_program_id, v_term_id) is distinct from (p_program_id, p_term_id) and v_status = any(p_active_statuses) then
    if p_cap is null or p_cap < 0 then
      raise exception 'move_registration_within_cap: bad request';
    end if;
    if (select count(*) from public.registrations r
         where r.program_id = p_program_id
           and r.term_id = p_term_id
           and r.registration_status = any(p_active_statuses)) >= p_cap then
      return jsonb_build_object('refused', 'PROGRAM_FULL');
    end if;
  end if;

  update public.registrations
     set program_id = p_program_id, term_id = p_term_id
   where id = p_registration_id and organization_id = p_organization_id;

  return jsonb_build_object('id', p_registration_id, 'program_id', p_program_id, 'term_id', p_term_id,
                            'previous_program_id', v_program_id, 'previous_term_id', v_term_id);
end;
$$;

revoke all on function public.move_registration_within_cap(bigint, bigint, bigint, bigint, integer, text[]) from public, anon, authenticated;
grant execute on function public.move_registration_within_cap(bigint, bigint, bigint, bigint, integer, text[]) to service_role;

comment on function public.move_registration_within_cap(bigint, bigint, bigint, bigint, integer, text[]) is
  'Moves a registration to another class under both classes'' locks, refusing a move that would put a child holding a place into a full class. Called by db/registrations.ts only.';

-- set_registration_status_within_cap as in 202610280007, with one change:
-- the registration's row is locked before the class (marked below).
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

  -- Changed (202610280010): the row is locked first, so a move can't
  -- change its class while this call counts; then the class's lock.
  select r.registration_status, r.program_id, r.term_id into v_current, v_program_id, v_term_id
    from public.registrations r
   where r.id = p_registration_id and r.organization_id = p_organization_id
     for update;
  if not found then
    return jsonb_build_object('refused', 'NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtext('registrations'), hashtext(v_program_id::text || ':' || v_term_id::text));

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

-- create_registration_within_cap as in 202610220001, with one change: a
-- taster takes the business's taster lock first (marked below).
create or replace function public.create_registration_within_cap(
  p_row jsonb,
  p_mode text,
  p_cap integer,
  p_trial_spots integer,
  p_active_statuses text[],
  p_family_duplicate boolean
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
set lock_timeout = '10s'
as $$
declare
  v_program_id bigint := (p_row->>'program_id')::bigint;
  v_term_id bigint := (p_row->>'term_id')::bigint;
  v_email text := nullif(p_row->>'parent_email', '');
  -- The child's name matched as text, never as a pattern.
  v_name text := replace(replace(replace(p_row->>'child_name', '\', '\\'), '%', '\%'), '_', '\_');
  v_status text := coalesce(p_row->>'registration_status', 'pending');
  v_statuses text[] := p_active_statuses;
  v_duplicate text;
  v_row jsonb;
  v_columns text;
  v_id bigint;
begin
  if v_program_id is null or v_term_id is null or p_row->>'child_name' is null
     or p_mode is null or p_mode not in ('standard', 'waitlist', 'trial')
     or coalesce(cardinality(p_active_statuses), 0) = 0
     or (p_mode <> 'trial' and (p_cap is null or p_cap < 0))
     or (p_mode = 'trial' and p_trial_spots is null) then
    raise exception 'create_registration_within_cap: bad request';
  end if;

  -- Changed (202610280010): one business's tasters are given one at a
  -- time, so the "already had a taster" check below can't be passed by two
  -- requests for different classes at the same moment.
  if p_mode = 'trial' then
    perform pg_advisory_xact_lock(hashtext('registrations_trial'), hashtext(coalesce(p_row->>'organization_id', '')));
  end if;

  perform pg_advisory_xact_lock(hashtext('registrations'), hashtext(v_program_id::text || ':' || v_term_id::text));

  if p_mode = 'trial' then
    if exists (
      select 1 from public.registrations r
       where r.organization_id = (p_row->>'organization_id')::bigint
         and r.registration_status = 'trial'
         and r.child_dob = (p_row->>'child_dob')::date
         and r.child_name ilike v_name
         and r.parent_phone = p_row->>'parent_phone'
    ) then
      return jsonb_build_object('refused', 'TRIAL_ALREADY_USED');
    end if;
    if (select count(*) from public.registrations r
         where r.trial_session_id = (p_row->>'trial_session_id')::bigint
           and r.registration_status = 'trial') >= p_trial_spots then
      return jsonb_build_object('refused', 'TRIAL_FULL');
    end if;
  else
    if (select count(*) from public.registrations r
         where r.program_id = v_program_id
           and r.term_id = v_term_id
           and r.registration_status = any(p_active_statuses)) >= p_cap then
      if p_mode = 'standard' then
        return jsonb_build_object('refused', 'PROGRAM_FULL');
      end if;
      v_status := 'waitlist';
    elsif p_mode = 'waitlist' then
      -- A place opened since the page loaded: register properly instead.
      return jsonb_build_object('refused', 'SPOT_OPEN');
    end if;
    if p_mode = 'waitlist' then
      v_statuses := v_statuses || array['waitlist'];
    end if;
  end if;

  select r.reference_code into v_duplicate
    from public.registrations r
   where r.term_id = v_term_id
     and r.child_name ilike v_name
     and r.registration_status = any(v_statuses)
     and (not p_family_duplicate or (
       r.child_dob is not distinct from (p_row->>'child_dob')::date
       and case when v_email is null
             then r.parent_email is null and r.parent_phone = p_row->>'parent_phone'
             else r.parent_email = v_email
           end))
   limit 1;
  if v_duplicate is not null then
    return jsonb_build_object('refused', 'DUPLICATE', 'reference_code', v_duplicate);
  end if;

  v_row := jsonb_set(p_row, '{registration_status}', to_jsonb(v_status));
  select string_agg(format('%I', k), ', ') into v_columns from jsonb_object_keys(v_row) as k;
  execute format(
    'insert into public.registrations (%1$s) select %1$s from jsonb_populate_record(null::public.registrations, $1) returning id',
    v_columns
  ) into v_id using v_row;

  return jsonb_build_object('id', v_id, 'registration_status', v_status);
end;
$$;

revoke all on function public.create_registration_within_cap(jsonb, text, integer, integer, text[], boolean) from public, anon, authenticated;
grant execute on function public.create_registration_within_cap(jsonb, text, integer, integer, text[], boolean) to service_role;
