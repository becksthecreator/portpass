-- The one accent a business is allowed: organizations.brand_color, read
-- into the shared --brand token and set inline on that page's own <main>
-- only (never :root, never <body>) -- see app/_components/blocks/brand.ts,
-- which computes a contrast-safe --brand-text from it at render time.
-- Null falls back to the platform default (coral).
alter table public.organizations add column if not exists brand_color text;

update public.organizations set brand_color = '#124055' where slug = 'futprep';
