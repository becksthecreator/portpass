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
  description: "Sign in to PortPass with Google or a 6-digit code sent to your email.",
  robots: { index: false, follow: true },
};

// What a failed Google round trip says (app/api/auth/google, /callback).
const NOTICES: Record<string, string> = {
  google_unavailable: "Google sign-in isn’t switched on yet. Use your email instead.",
  google_failed: "Google didn’t complete the sign-in. Try again, or use your email.",
};

// The one door (speed & sign-in brief, 29 Sept, 2.7): Continue with
// Google, then email, then "you don't need an account to book", and a
// small "I run a business" at the bottom. All of that lives in OtpForm.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; email?: string }> }) {
  const { next: rawNext, error, email } = await searchParams;
  const next = safeNext(rawNext, "") || null;

  const session = await getSession();
  if (session) {
    const lastChoice = (await cookies()).get(LAST_CHOICE_COOKIE)?.value ?? null;
    redirect(resolveDestination(session, { next, lastChoice }));
  }

  const google = `/api/auth/google?mode=login${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "Sign in", href: "/login" }]} />
      <OtpForm mode="login" next={next} phoneEnabled={phoneOtpEnabled()} google={google} notice={error ? NOTICES[error] ?? null : null} initialEmail={typeof email === "string" ? email.slice(0, 254) : ""} />
      <SiteFooter />
    </main>
  );
}
