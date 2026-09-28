import { redirect } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { adminStepUp } from "@/lib/auth/admin";
import { requirePlatformRole } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/next";
import { VerifyForm } from "./VerifyForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Two-step login | PortPass admin",
  robots: { index: false, follow: false },
};

// The step between a platform-role sign-in and /admin: set up an
// authenticator the first time, enter a code every 12 hours after that.
export default async function AdminVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext, "/admin") || "/admin";
  await requirePlatformRole("platform_admin", `/admin/verify?next=${encodeURIComponent(next)}`);

  const step = await adminStepUp();
  if (step.aal2 && step.windowOpen) redirect(next);

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "PortPass admin", href: "/admin" }, { label: "Two-step login", href: "/admin/verify" }]} />
      <div className="auth-card">
        <div className="eyebrow"><span className="eyebrow-dot" />PortPass admin</div>
        <h1>{step.enrolled ? "Enter your code." : "Set up two-step login."}</h1>
        <p className="auth-lead">
          {step.enrolled
            ? "Admin areas ask for a fresh authenticator code every 12 hours."
            : "Platform accounts need a second step before the admin area opens. It takes a minute and you only do it once."}
        </p>
        <VerifyForm mode={step.enrolled ? "challenge" : "enroll"} factorId={null} next={next} />
      </div>
      <SiteFooter />
    </main>
  );
}
