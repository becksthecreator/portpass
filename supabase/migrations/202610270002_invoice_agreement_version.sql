-- Each invoice carries the agreement version it was raised under (growth
-- plan, 16 Oct 2026). billing_accounts.agreement_version (202610090001) is
-- typed on Admin -> Billing's account form; from here every invoice raised
-- for that business copies it as it stands that day, and its PDF prints
-- it. Changing the account's version later never rewrites an invoice
-- already raised.
--
-- A trigger rather than a change to create_portpass_invoice, so every way
-- an invoice is raised (the daily job, a founder's manual invoice, Market
-- fees) carries it. An old invoice entered by hand (kind 'historical')
-- keeps what it had: none. Nullable, and null on every invoice raised
-- before this.

alter table public.portpass_invoices add column if not exists agreement_version text;

comment on column public.portpass_invoices.agreement_version is
  'The agreement version on the business''s billing account when this invoice was raised. Printed on the PDF. Never rewritten.';

create or replace function public.portpass_invoice_agreement_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.agreement_version is null and new.kind <> 'historical' then
    select account.agreement_version into new.agreement_version
      from public.billing_accounts account
     where account.organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

revoke all on function public.portpass_invoice_agreement_version() from public, anon, authenticated;

drop trigger if exists portpass_invoices_agreement_version on public.portpass_invoices;
create trigger portpass_invoices_agreement_version
  before insert on public.portpass_invoices
  for each row execute function public.portpass_invoice_agreement_version();
