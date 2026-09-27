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
  title: "Sign in | PortPass Bahamas",
  description: "Sign in to PortPass with a 6-digit code sent to your email.",
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext, "") || null;

  const session = await getSession();
  if (session) {
    const lastChoice = (await cookies()).get(LAST_CHOICE_COOKIE)?.value ?? null;
    redirect(resolveDestination(session, { next, lastChoice }));
  }

  return (
    <main className="form-page auth-page">
      <SiteHeader breadcrumb={[{ label: "Sign in", href: "/login" }]} />
      <OtpForm mode="login" next={next} phoneEnabled={phoneOtpEnabled()} />
      <SiteFooter />
    </main>
  );
}
