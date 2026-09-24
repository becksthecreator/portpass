-- Replaces the bespoke page's 18-photo catalogue-*.webp cycling gallery
-- with the six remaining supplied real ceremony photos (bws-11..16) --
-- bws-9 and bws-10 are used directly in page.tsx (Antonio's portrait and
-- the hero image) rather than through this table. ceremony.jpg's row also
-- drops out of the live set so the gallery shows exactly six, per the
-- brief.
--
-- Package image_urls (previously catalogue-05/10/13/14) are cleared to
-- null rather than reused from this same six-photo set: with six packages
-- now live (not four) and only eight real photos total, reusing them on
-- package cards would mean a visitor sees the same six photos twice in a
-- row (gallery, then packages) with no variety. PackageTiers.tsx already
-- renders cleanly with no image; parity with the vow-renewal card, which
-- never had one.
update public.wedding_packages set image_url = null where slug in ('pink-sand', 'yellow-elder', 'poinciana', 'hibiscus');

update public.wedding_gallery_images set visibility = 'draft' where image_url = '/weddings/bahamas-by-the-sea/ceremony.jpg';

delete from public.wedding_gallery_images where image_url like '/weddings/bahamas-by-the-sea/catalogue-%';

insert into public.wedding_gallery_images (image_url, caption, is_hero, visibility, sort_order)
values
  ('/weddings/bahamas-by-the-sea/bws-11.webp', 'A couple with Antonio Beckford under a turquoise-draped ceremony arch.', false, 'live', 0),
  ('/weddings/bahamas-by-the-sea/bws-12.webp', 'A couple kissing on the beach beneath an open sky.', false, 'live', 1),
  ('/weddings/bahamas-by-the-sea/bws-13.webp', 'Antonio Beckford officiating a garden ceremony as the couple embraces.', false, 'live', 2),
  ('/weddings/bahamas-by-the-sea/bws-14.webp', 'A couple with Antonio Beckford under a white draped ceremony arch.', false, 'live', 3),
  ('/weddings/bahamas-by-the-sea/bws-15.webp', 'A beach ceremony with seated guests and a lit tiki torch.', false, 'live', 4),
  ('/weddings/bahamas-by-the-sea/bws-16.webp', 'A resort beach ceremony with full guest rows and purple florals.', false, 'live', 5);
