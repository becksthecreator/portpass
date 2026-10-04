// @public-route: the sign-up form for an event or a shop visit.
import { notFound } from "next/navigation";
import { EventSignupPage } from "@/app/_components/event/EventSignupPage";
import { cleanEventCode, eventName } from "@/lib/eventSignup";

export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ event: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const code = cleanEventCode((await params).event);
  return {
    title: code ? `Sign up at ${eventName(code)} | PortPass Bahamas` : "Sign up | PortPass Bahamas",
    description: "Get your business on PortPass in 30 seconds: your prices, photos and a booking button in one link.",
    robots: { index: false, follow: true },
  };
}

// /join/<event>: the same 30-second form as /own, for the next event, a
// school fair or a shop visit (brief 18, C1). The event is whatever the
// link says, as long as it is a plain code ("school-fair-nov"); no deploy
// is needed to start a new one.
export default async function JoinPage({ params }: { params: Params }) {
  const code = cleanEventCode((await params).event);
  if (!code) notFound();
  return <EventSignupPage event={code} path={`/join/${code}`} />;
}
