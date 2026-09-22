-- hero_image_url now feeds the split IdentityBlock on the new templated
-- site (app/sites/[slug]) as well as the category-page feature card --
-- switching it to the ceremony photo matches the choice already made for
-- the PortPass listing page's identity block in the previous round.
update public.organizations set
  hero_image_url = '/weddings/bahamas-by-the-sea/ceremony.jpg'
where slug = 'bahamas-weddings';
