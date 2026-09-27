-- Already applied to the live project on 25 Sept (through the Supabase
-- MCP, as "organization_faqs_add_link") but never committed here, so the
-- local CI database was missing two columns db/organizations.ts selects.
-- Idempotent so it's a no-op wherever it has already run.
alter table public.organization_faqs
  add column if not exists link_url text,
  add column if not exists link_label text;
