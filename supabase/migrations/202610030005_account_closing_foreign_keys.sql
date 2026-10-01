-- Closing a PortPass account (privacy policy v2, "Deleting your account":
-- "Email us and we will close your PortPass account within 40 days").
--
-- Found while checking that promise against the database: five columns
-- that record WHO did something pointed at auth.users with no rule for
-- what happens when that user is deleted, so Postgres refused to delete
-- any account that had ever accepted an invite, been linked to an earlier
-- registration, or approved a listing. They now become empty instead: the
-- log keeps the record that a change was made, without the person.
--
-- Nothing is deleted by this migration.

alter table public.audit_log
  drop constraint if exists audit_log_actor_user_id_fkey,
  add constraint audit_log_actor_user_id_fkey foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table public.organization_members
  drop constraint if exists organization_members_invited_by_fkey,
  add constraint organization_members_invited_by_fkey foreign key (invited_by) references auth.users(id) on delete set null;

alter table public.organization_invites
  drop constraint if exists organization_invites_invited_by_fkey,
  add constraint organization_invites_invited_by_fkey foreign key (invited_by) references auth.users(id) on delete set null;

alter table public.organizations
  drop constraint if exists organizations_approved_by_fkey,
  add constraint organizations_approved_by_fkey foreign key (approved_by) references auth.users(id) on delete set null;

alter table public.organizations
  drop constraint if exists organizations_licence_verified_by_fkey,
  add constraint organizations_licence_verified_by_fkey foreign key (licence_verified_by) references auth.users(id) on delete set null;
