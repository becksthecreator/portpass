import { ClaimView } from "../ClaimView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Claim your business | PortPass Bahamas",
  robots: { index: false, follow: false },
  // The address holds the one-use token: never send it on to another site.
  referrer: "no-referrer" as const,
};

// The page a business owner lands on from the claim link PortPass sent
// them (brief 08, 1.2).
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClaimView token={token} path={`/claim/${token}`} />;
}
