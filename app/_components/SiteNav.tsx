"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type TouchEvent as ReactTouchEvent } from "react";

export type NavSubsection = { slug: string; name: string; href: string; live: number | null };
export type NavSection = { slug: string; name: string; href: string; live: number | null; subsections: NavSubsection[] };

// The header's section navigation (round 5, §2 and §3). Both halves read
// the same tree the server built from the categories table:
//  - ≥1024px: one trigger per section; hover or click opens a dropdown of
//    its subsections (live count or "Soon") plus "All <section> →". Enter
//    opens, Esc closes, Tab cycles inside the open panel, aria-expanded
//    tracks it. The panels are in the DOM (hidden) so crawlers still see
//    every section and subsection link in the header.
//  - below: a "Browse" button opening a bottom sheet -- the sections as big
//    rows, each expanding to its subsections with "All <section> →" first.
//    It closes on the X, a swipe down, Esc, or the Back button: opening
//    pushes a history entry, so Back pops it instead of leaving the page.
export function SiteNav({ sections }: { sections: NavSection[] }) {
  return (
    <>
      <DesktopNav sections={sections} />
      <BrowseSheet sections={sections} />
    </>
  );
}

function liveTag(live: number | null): string | null {
  if (live === null) return null;
  return live > 0 ? String(live) : "Soon";
}

// ---- desktop ---------------------------------------------------------------

function DesktopNav({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const hoverOpenedAt = useRef(0);
  const closeTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(null), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(null), 160);
  };

  return (
    <nav className="site-shell-nav" aria-label="Categories" ref={rootRef}>
      {sections.map((section) => (
        <NavItem
          key={section.slug}
          section={section}
          isOpen={open === section.slug}
          onHoverOpen={() => {
            cancelClose();
            hoverOpenedAt.current = Date.now();
            setOpen(section.slug);
          }}
          onHoverLeave={scheduleClose}
          onToggle={() => {
            cancelClose();
            // A tap on a touch laptop fires mouseenter (which opened the
            // panel) right before click -- don't let the click close it again.
            if (open === section.slug && Date.now() - hoverOpenedAt.current < 400) return;
            setOpen(open === section.slug ? null : section.slug);
          }}
          onClose={() => setOpen(null)}
        />
      ))}
    </nav>
  );
}

function NavItem({ section, isOpen, onHoverOpen, onHoverLeave, onToggle, onClose }: { section: NavSection; isOpen: boolean; onHoverOpen: () => void; onHoverLeave: () => void; onToggle: () => void; onClose: () => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `nav-panel-${section.slug}`;

  function onKeyDown(event: ReactKeyboardEvent) {
    if (!isOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onToggle();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      triggerRef.current?.focus();
      return;
    }
    const focusables = [triggerRef.current, ...Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a[href]") ?? [])].filter((el): el is HTMLElement => el !== null);
    if (!focusables.length) return;
    const index = focusables.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Tab") {
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        focusables[focusables.length - 1].focus();
      } else if (!event.shiftKey && index === focusables.length - 1) {
        event.preventDefault();
        focusables[0].focus();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusables[Math.min(index + 1, focusables.length - 1)].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusables[Math.max(index - 1, 0)].focus();
    }
  }

  return (
    <div className={`nav-item${isOpen ? " is-open" : ""}`} onMouseEnter={onHoverOpen} onMouseLeave={onHoverLeave} onKeyDown={onKeyDown}>
      <button ref={triggerRef} type="button" className="nav-trigger" aria-expanded={isOpen} aria-controls={panelId} aria-haspopup="true" onClick={onToggle}>
        {section.name} <span className="nav-caret" aria-hidden="true">▾</span>
      </button>
      <div className="nav-panel" id={panelId} ref={panelRef} hidden={!isOpen}>
        <Link className="nav-panel-all" href={section.href} tabIndex={isOpen ? 0 : -1}>
          All {section.name} <span aria-hidden="true">→</span>
        </Link>
        {section.subsections.length > 0 && (
          <ul className="nav-panel-list">
            {section.subsections.map((sub) => (
              <li key={sub.slug}>
                <Link href={sub.href} tabIndex={isOpen ? 0 : -1}>
                  {sub.name}
                  {liveTag(sub.live) && <small>{liveTag(sub.live)}</small>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---- phone and tablet ------------------------------------------------------

const SHEET_STATE_KEY = "portpassBrowseSheet";

function sheetInHistory(): boolean {
  const state = typeof window === "undefined" ? null : (window.history.state as Record<string, unknown> | null);
  return Boolean(state && state[SHEET_STATE_KEY]);
}

function BrowseSheet({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  // The sheet is a history entry: opening pushes one, Back pops it (and
  // closes the sheet), and the X / a swipe go back the same way so the
  // history never holds a stale "sheet open" entry. Arriving back on the
  // page the sheet was opened from reopens it, so the next Back closes it
  // instead of leaving the page.
  const openSheet = () => {
    window.history.pushState({ [SHEET_STATE_KEY]: true }, "");
    setOpen(true);
  };
  const closeSheet = useCallback(() => {
    if (sheetInHistory()) window.history.back();
    else setOpen(false);
  }, []);

  useEffect(() => {
    const sync = () => setOpen(sheetInHistory());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (event.key === "Tab" && sheetRef.current) {
        const focusables = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")).filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const opener = openerRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [open, closeSheet]);

  const onTouchStart = (event: ReactTouchEvent) => {
    dragStart.current = event.touches[0].clientY;
  };
  const onTouchMove = (event: ReactTouchEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, event.touches[0].clientY - dragStart.current));
  };
  const onTouchEnd = () => {
    const travelled = dragY;
    dragStart.current = null;
    if (travelled > 90) closeSheet();
    else setDragY(0);
  };

  return (
    <>
      <button ref={openerRef} type="button" className="site-shell-browse-button" aria-haspopup="dialog" aria-expanded={open} onClick={openSheet}>
        Browse <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="sheet-root">
          <div className="sheet-backdrop" onClick={closeSheet} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Browse PortPass" ref={sheetRef} style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}>
            <div className="sheet-head" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
              <span className="sheet-handle" aria-hidden="true" />
              <div className="sheet-title-row">
                <strong>Browse</strong>
                <button ref={closeRef} type="button" className="sheet-close" aria-label="Close" onClick={closeSheet}>×</button>
              </div>
            </div>
            <ul className="sheet-list">
              {sections.map((section) => {
                const isExpanded = expanded === section.slug;
                const tag = section.live === null ? null : section.live > 0 ? `${section.live} open` : "Coming soon";
                return (
                  <li key={section.slug} className={isExpanded ? "is-open" : undefined}>
                    <button type="button" aria-expanded={isExpanded} aria-controls={`sheet-${section.slug}`} onClick={() => setExpanded(isExpanded ? null : section.slug)}>
                      <span className="sheet-section-name">{section.name}</span>
                      {tag && <small>{tag}</small>}
                      <span className="sheet-caret" aria-hidden="true">▾</span>
                    </button>
                    <div className="sheet-subs" id={`sheet-${section.slug}`} hidden={!isExpanded}>
                      <Link className="sheet-all" href={section.href}>
                        All {section.name} <span aria-hidden="true">→</span>
                      </Link>
                      {section.subsections.map((sub) => (
                        <Link key={sub.slug} href={sub.href}>
                          {sub.name}
                          {liveTag(sub.live) && <small>{liveTag(sub.live)}</small>}
                        </Link>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="sheet-foot">
              <Link href="/business">For business</Link>
              <Link href="/about">About</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
