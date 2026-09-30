import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OtpForm } from "@/app/_components/auth/OtpForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { phoneOtpEnabled } from "@/lib/auth/env";
import { safeNext } from "@/lib/auth/next";
import { LAST_CHOICE_COOKIE, resolveDestination } from "@/lib/auth/routing";
import { getSession } from "@/lib/auth/session";
import { getSectionOptions } from "@/lib/navSections";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create an account | PortPass Bahamas",
  description: "One PortPass account for booking, joining, or running your business.",
  robots: { index: false, follow: true },
};

const NOTICES: Record<string, string> = {
  google_unavailable: "Google sign-in isn’t switched on yet. Use your email instead.",
  google_failed: "Google didn’t complete the sign-in. Try again, or use your email.",
};

// Guest-first (speed & sign-in brief, 29 Sept, 2.1): a confirmation
// screen's "Save this to a free PortPass account" arrives here with
// ?as=customer&email=…&name=… so the form is already filled in.
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; as?: string; error?: string; email?: string; name?: string }> }) {
  const { next: rawNext, as, error, email, name } = await searchParams;
  const next = safeNext(rawNext, "") || null;
  const initialIntent = as === "business" ? "business" : as === "customer" ? "customer" : null;

  const session = await getSession();
  if (session) {
    const lastChoice = (await cookies()).get(LAST_CHOICE_COOKIE)?.value ?? null;
    redirect(resolveDestination(session, { next, lastChoice, intent: initialIntent }));
  }

  const sections = await getSectionOptions();
  const google = `/api/auth/google?mode=signup${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "Create an account", href: "/signup" }]} />
      <OtpForm
        mode="signup"
        next={next}
        initialIntent={initialIntent}
        phoneEnabled={phoneOtpEnabled()}
        sections={sections}
        google={google}
        notice={error ? NOTICES[error] ?? null : null}
        initialEmail={typeof email === "string" ? email.slice(0, 254) : ""}
        initialName={typeof name === "string" ? name.slice(0, 120) : ""}
      />
      <SiteFooter />
    </main>
  );
}
