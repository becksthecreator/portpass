-- Fixes for the /sites/bahamas-weddings templated page: it was still
-- running on the generic catalogue-*.webp placeholders (stock-feeling, and
-- two of them doubled up across the People/Identity/offering slots) instead
-- of the eight real Bahamas Weddings By The Sea ceremony photos supplied
-- for this page specifically (bws-9 through bws-16, added to the same
-- public/weddings/bahamas-by-the-sea/ folder the rest of this business's
-- assets already live in). Also fixes a double-hyphen-for-em-dash typo in
-- this business's own copy, and the same bug found while re-checking the
-- rest of the seed content.

-- Antonio's portrait (People block) and the ceremony photo behind the split
-- Identity block both move off the generic catalogue set onto photos of him
-- specifically: bws-9 is a close portrait of him at a ceremony, bws-10 is
-- the floral-arch ceremony with turquoise water behind it.
update public.organizations set
  owner_image_url = '/weddings/bahamas-by-the-sea/bws-9.webp',
  hero_image_url = '/weddings/bahamas-by-the-sea/bws-10.webp',
  owner_bio = 'Antonio Beckford is the planner and licensed officiant behind Bahamas Weddings By The Sea. With more than 26 years of experience, he brings a personal touch to every ceremony and clear guidance to the planning — from your first questions to the words you say at the water''s edge.',
  description = 'Bahamas Weddings By The Sea plans and officiates beachfront ceremonies in Nassau — real prices, a real planning desk, and Antonio himself at the water''s edge.'
where slug = 'bahamas-weddings';

-- Replace the four catalogue-*.webp gallery photos with the six remaining
-- supplied photos (bws-11..16) -- real ceremonies across beach, garden and
-- resort settings, all with Antonio in the shot, instead of the stock-feeling
-- placeholder set.
delete from public.organization_images
where organization_id = (select id from public.organizations where slug = 'bahamas-weddings');

insert into public.organization_images (organization_id, url, alt, sort_order)
select o.id, v.url, v.alt, v.sort_order
from public.organizations o
cross join (values
  ('/weddings/bahamas-by-the-sea/bws-11.webp', 'A couple with Antonio Beckford under a turquoise-draped ceremony arch.', 0),
  ('/weddings/bahamas-by-the-sea/bws-12.webp', 'A couple kissing on the beach beneath an open sky.', 1),
  ('/weddings/bahamas-by-the-sea/bws-13.webp', 'Antonio Beckford officiating a garden ceremony as the couple embraces.', 2),
  ('/weddings/bahamas-by-the-sea/bws-14.webp', 'A couple with Antonio Beckford under a white draped ceremony arch.', 3),
  ('/weddings/bahamas-by-the-sea/bws-15.webp', 'A beach ceremony with seated guests and a lit tiki torch.', 4),
  ('/weddings/bahamas-by-the-sea/bws-16.webp', 'A resort beach ceremony with full guest rows and purple florals.', 5)
) as v(url, alt, sort_order)
where o.slug = 'bahamas-weddings';

-- Same swap for the four package cards -- reusing four of the six gallery
-- photos above rather than leaving the cards without a photo at all.
update public.offerings set image_url = '/weddings/bahamas-by-the-sea/bws-15.webp'
where organization_id = (select id from public.organizations where slug = 'bahamas-weddings') and slug = 'pink-sand';
update public.offerings set image_url = '/weddings/bahamas-by-the-sea/bws-13.webp'
where organization_id = (select id from public.organizations where slug = 'bahamas-weddings') and slug = 'yellow-elder';
update public.offerings set image_url = '/weddings/bahamas-by-the-sea/bws-11.webp'
where organization_id = (select id from public.organizations where slug = 'bahamas-weddings') and slug = 'poinciana';
update public.offerings set image_url = '/weddings/bahamas-by-the-sea/bws-12.webp'
where organization_id = (select id from public.organizations where slug = 'bahamas-weddings') and slug = 'hibiscus';

-- The same "--" for an em dash typo, found and fixed above in BWS's own
-- copy, also shows up in Futprep's seed content (202609211002) -- fixing it
-- there too rather than leaving it as a known, unfixed instance of the same
-- bug.
update public.organizations set
  description = 'Futprep runs weekly football classes for young children in Nassau, led by Coach Alexander Thompson. Sign up online and pay by bank transfer — no phone calls, no forms at the field.'
where id = 1;

update public.offerings set summary = 'A first taste of organized football — short sessions built for little legs and short attention spans.'
where organization_id = 1 and slug = 'lil-kickers';
update public.offerings set summary = 'The next step up — real drills, real small-sided games, still built around having fun.'
where organization_id = 1 and slug = 'kickers';
