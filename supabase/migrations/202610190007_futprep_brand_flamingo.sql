-- Brief 27 (D): the Futprep home page and its class pages take their
-- colours from organizations.brand_color through lib/businessTheme.ts, so
-- Flamingo Night reaches them the same way every business is coloured:
-- the pink as the brand (navy words on it, since white would not read)
-- and the navy as the header and dark-page background.
-- Switch back: brand_color = '#124055' and remove the "background" key.
update public.organizations
set brand_color = '#FF4A86',
    theme = coalesce(theme, '{}'::jsonb) || '{"background": "#0F1B2D"}'::jsonb
where slug = 'futprep';
