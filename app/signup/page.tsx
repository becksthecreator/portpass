import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OtpForm } from "@/app/_components/auth/OtpForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { phoneOtpEnabled } from "@/lib/auth/env";
import { safeNext } from "@/lib/auth/next";
import { LAST_CHOICE_COOKIE, resolveDestination } from "@/lib/auth/routing";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create an account | PortPass Bahamas",
  description: "One PortPass account for booking, joining, or running your business.",
  robots: { index: false, follow: true },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const { next: rawNext, as } = await searchParams;
  const next = safeNext(rawNext, "") || null;
  const initialIntent = as === "business" ? "business" : as === "customer" ? "customer" : null;

  const session = await getSession();
  if (session) {
    const lastChoice = (await cookies()).get(LAST_CHOICE_COOKIE)?.value ?? null;
    redirect(resolveDestination(session, { next, lastChoice, intent: initialIntent }));
  }

  return (
    <main className="form-page auth-page">
      <SiteHeader breadcrumb={[{ label: "Create an account", href: "/signup" }]} />
      <OtpForm mode="signup" next={next} initialIntent={initialIntent} phoneEnabled={phoneOtpEnabled()} />
      <SiteFooter />
    </main>
  );
}
