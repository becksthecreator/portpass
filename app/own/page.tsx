// @public-route: the sign-up form on the OWN Conference QR.
import { EventSignupPage } from "@/app/_components/event/EventSignupPage";
import { OWN_EVENT } from "@/lib/eventSignup";

// ISR: the header shows live counts; the form itself is the same for everyone.
export const revalidate = 300;

export const metadata = {
  title: "Get your business on PortPass | PortPass Bahamas",
  description: "Sign up in 30 seconds at the OWN Conference: your prices, photos and a booking button in one link.",
  // A campaign form, not a page for search results.
  robots: { index: false, follow: true },
};

// /own: the QR on the OWN Conference material (8-11 Oct 2026). It used to
// redirect to /apply; it is now the 30-second form itself (brief 18, C1).
export default function OwnPage() {
  return <EventSignupPage event={OWN_EVENT} path="/own" />;
}
