import Link from "next/link";

// Block 8 of 8 -- always renders, and doubles as a sticky bar on mobile so
// the action stays reachable without scrolling back up.
export function ActionBlock({ label, href }: { label: string; href: string }) {
  return (
    <>
      <section className="tpl-action" aria-label="Get started">
        <Link className="tpl-button" href={href}>{label} <span aria-hidden="true">→</span></Link>
      </section>
      <Link className="tpl-action-sticky" href={href}>{label} <span aria-hidden="true">→</span></Link>
    </>
  );
}
