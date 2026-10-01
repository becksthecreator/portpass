-- Admin Control Center, Businesses (brief 08, 1.2 and 1.3): approve, send
-- back with a note, suspend and unsuspend; add a business for an owner
-- (concierge) and hand it over with a claim link.

-- What PortPass asked the owner to change (send back), and what a
-- suspended listing looked like before, so unsuspending puts it back.
alter table public.organizations
  add column if not exists review_note text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  -- {"status": "live", "is_published": true, "is_directory_listed": true}
  add column if not exists suspended_from jsonb;

-- A claim link: PortPass builds the page, then sends the owner a link (on
-- WhatsApp). Whoever opens it and signs in becomes the business's owner.
-- Only a hash of the token is stored. One use, and it expires.
create table if not exists public.organization_claim_links (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists organization_claim_links_org_idx on public.organization_claim_links (organization_id);

alter table public.organization_claim_links enable row level security;
revoke all on public.organization_claim_links from anon, authenticated;

comment on table public.organization_claim_links is
  'One-use links that hand a PortPass-built business to its owner. Token stored as a hash only.';

-- People & access (brief 08, 1.5): force sign-out. Removes every session
-- the person has, so their next request anywhere is refused and they must
-- sign in again. Called by the server only (service role), never from a
-- browser.
create or replace function public.admin_revoke_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = auth, public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
