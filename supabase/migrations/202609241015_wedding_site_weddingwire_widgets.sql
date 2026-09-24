-- Antonio has supplied his real WeddingWire member ID (946150) and all
-- three official embed codes (rating badge, 2026 Couples' Choice Award
-- badge, reviews widget). These replace the hand-entered "5.0", "100
-- reviews" and "6 Couples' Choice Awards" in the trust strip -- see the
-- brief. Only one of the three (reviews_widget_html) had a column before
-- this; adding the other two rather than overloading one field, since the
-- admin UI needs to edit them independently.
alter table public.wedding_site_settings add column if not exists rating_badge_html text;
alter table public.wedding_site_settings add column if not exists award_badge_html text;

update public.wedding_site_settings set
  rating_badge_html = '<script src="https://cdn1.weddingwire.com/_js/wp-rated.js?v=4"></script>
<a target="_blank" id="wp-rated-img" rel="nofollow"
   href="https://www.weddingwire.com/biz/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html"
   title="Reviewed on WeddingWire">
  <span id="wp-rated-reviews"></span>
</a>
<script>wpShowRatedWW(''946150'');</script>',
  award_badge_html = '<div id="wp-ratedWA">
  <a target="_blank" rel="nofollow"
     href="https://www.weddingwire.com/biz/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html"
     title="WeddingWire Couples'' Choice Award Winner 2026">
    <img width="125" height="125" alt="Bahamas Weddings By The Sea"
         id="wp-ratedWA-img-2026"
         src="https://cdn1.weddingwire.com/img/badges/2026/badge-weddingawards_en_US.png">
  </a>
</div>
<script type="text/javascript" src="https://cdn1.weddingwire.com/_js/wp-rated.js?v=4"></script>
<script>wpShowRatedWAv3(''946150'',''2026'');</script>',
  reviews_widget_html = '<script src="https://cdn1.weddingwire.com/js/wp-widget.js?symfnw-US248-1-20260923-006-1_www_m_"></script>
<div id="wp-widget-reviews">
  <div id="wp-widget-preview">
    Read <a href="https://www.weddingwire.com/reviews/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html" rel="nofollow">View reviews:</a> in &nbsp;
    <a href=''https://www.weddingwire.com'' rel="nofollow">
      <img src="https://cdn1.weddingwire.com/assets/img/logos/gen_logoHeader.svg" height="20">
    </a>
  </div>
</div>
<script>wpShowReviews(946150, "red");</script>',
  updated_at = now()
where id = 1;
