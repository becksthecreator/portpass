-- Brief 27 (D): Futprep's palette, Flamingo Night, stored on its own row as
-- CSS custom properties (organizations.theme.tokens) and emitted on every
-- Futprep page root by lib/futprepTheme.ts. The same values ship in the
-- code as the fallback, so applying this before the code is harmless, and
-- a business without tokens is untouched (PortPass pages keep Harbour
-- Signal). Switch back: remove the "tokens" key from the theme.
update public.organizations
set theme = coalesce(theme, '{}'::jsonb) || jsonb_build_object(
  'tokens', jsonb_build_object(
    '--fp-pink', '#FF4A86',
    '--fp-pink-deep', '#D1185C',
    '--fp-pink-soft', '#FFE8F0',
    '--fp-mint', '#2FC9AE',
    '--fp-mint-deep', '#0F7A68',
    '--fp-mint-soft', '#E6FAF6',
    '--fp-navy', '#0F1B2D',
    '--fp-base', '#F7F9FC'
  )
)
where slug = 'futprep';
