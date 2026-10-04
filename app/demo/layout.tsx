import type { ReactNode } from "react";
import { DEMO_BANNER } from "@/lib/demoText";
import "./demo.css";

// Every /demo screen carries the banner (brief 18, part B), so nobody can
// mistake the example business for a real one.
export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="demo-banner" role="note">
        <span>{DEMO_BANNER}</span>
      </div>
      {children}
    </>
  );
}
