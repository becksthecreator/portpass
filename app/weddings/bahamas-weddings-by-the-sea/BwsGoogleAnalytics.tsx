import Script from "next/script";

// Google Analytics 4 for Bahamas Weddings By The Sea's pages only, so the
// client can see visits and planner enquiries in their own Google account.
// Renders nothing until NEXT_PUBLIC_BWS_GA4_ID holds their measurement ID
// (G-XXXXXXX). Storage consent is denied up front, so GA sets no cookies
// and sends cookieless pings, in line with the privacy policy's
// "cookieless analytics". lib/analytics.ts forwards planner_start,
// planner_contact and planner_submit to it; mark those as key events in GA.
const ID_SHAPE = /^G-[A-Z0-9]{4,20}$/;

export function BwsGoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_BWS_GA4_ID?.trim();
  if (!id || !ID_SHAPE.test(id)) return null;
  return (
    <>
      <Script id="bws-ga4-consent" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});gtag('js',new Date());gtag('config','${id}');`}
      </Script>
      <Script id="bws-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
    </>
  );
}
