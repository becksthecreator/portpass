import Link from "next/link";

// Internal/staff links live in the footer, never the public nav -- a
// parent-facing page shouldn't lead with plumbing meant for staff.
export function TemplateFooter({ orgName, staffHref }: { orgName: string; staffHref?: string }) {
  return (
    <footer className="tpl-footer">
      <span>{orgName} · Booking and payments powered by PortPass</span>
      <div className="tpl-footer-links">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        {staffHref && <Link href={staffHref}>Staff login</Link>}
      </div>
    </footer>
  );
}
