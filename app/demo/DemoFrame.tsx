import type { ReactNode } from "react";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";

// The frame around a demo screen: the same card the business area uses,
// with "Demo business" as the way back.
export function DemoFrame({ crumbs = [], children }: { crumbs?: { label: string; href: string }[]; children: ReactNode }) {
  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "Demo business", href: "/demo/home" }, ...crumbs]} />
      <div className="auth-card auth-card-wide">{children}</div>
      <SiteFooter />
    </main>
  );
}
