-- Audit finding 2 (brief 33, PR #198): a class can be oversold when a term
-- opens. The app counted the places taken, checked for a duplicate and
-- inserted in separate calls, so two parents pressing for the last place
-- at the same moment both got it, and a double tap made two rows.
--
-- Now one call does all three, under a lock for that class and term, so
-- registrations for one class are taken one at a time, whichever server
-- copy sends them. The app still works out the cap (the coaches on duty
-- for a family, the class capacity for the staff desk) and passes it in,
-- with the statuses that take a place (ACTIVE_REGISTRATION_STATUSES in
-- db/registrations.ts). The refusals are the app's own words:
--
--   p_mode 'standard'  class full                  -> PROGRAM_FULL
--   p_mode 'waitlist'  class full                  -> the row is a waitlist entry
--                      a place free                -> SPOT_OPEN
--   p_mode 'trial'     this child had a taster     -> TRIAL_ALREADY_USED
--                      the taster spots are taken  -> TRIAL_FULL
--   any mode           already registered          -> DUPLICATE:<reference code>
--
-- p_family_duplicate true (the parent forms): a duplicate is the same child
-- name and date of birth from the same email, or, with no email, from the
-- same phone. false (the staff desk's quick add): the same child name in
-- the term.
--
-- p_row is the registrations row exactly as the app built it (column ->
-- value). Only its keys are inserted, so every other column keeps its
-- default, as with an insert through the API. Returns the new row's id
-- and its status.

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
     or (p_mode <> 'trial' and p_cap is null) then
    raise exception 'create_registration_within_cap: bad request';
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
      raise exception 'TRIAL_ALREADY_USED';
    end if;
    if (select count(*) from public.registrations r
         where r.trial_session_id = (p_row->>'trial_session_id')::bigint
           and r.registration_status = 'trial') >= coalesce(p_trial_spots, 0) then
      raise exception 'TRIAL_FULL';
    end if;
  else
    if (select count(*) from public.registrations r
         where r.program_id = v_program_id
           and r.term_id = v_term_id
           and r.registration_status = any(p_active_statuses)) >= p_cap then
      if p_mode = 'standard' then
        raise exception 'PROGRAM_FULL';
      end if;
      v_status := 'waitlist';
    elsif p_mode = 'waitlist' then
      -- A place opened since the page loaded: register properly instead.
      raise exception 'SPOT_OPEN';
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
    raise exception 'DUPLICATE:%', v_duplicate;
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

comment on function public.create_registration_within_cap(jsonb, text, integer, integer, text[], boolean) is
  'Takes a place in a class: counts the places taken, checks for a duplicate and inserts the registration in one step, under a lock per class and term. Called by db/registrations.ts only.';
