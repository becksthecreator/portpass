-- Follow-up fix: the packages section (1,665px, the largest on the page,
-- where the actual purchase decision happens) had zero photographs. Each
-- published tier gets one image, sourced from the existing gallery
-- catalogue rather than new photography.
alter table public.wedding_packages add column if not exists image_url text;

update public.wedding_packages set image_url = '/weddings/bahamas-by-the-sea/catalogue-14.webp' where slug = 'pink-sand';
update public.wedding_packages set image_url = '/weddings/bahamas-by-the-sea/catalogue-13.webp' where slug = 'yellow-elder';
update public.wedding_packages set image_url = '/weddings/bahamas-by-the-sea/catalogue-05.webp' where slug = 'poinciana';
update public.wedding_packages set image_url = '/weddings/bahamas-by-the-sea/catalogue-10.webp' where slug = 'hibiscus';
