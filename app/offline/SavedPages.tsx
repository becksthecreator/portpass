"use client";

import { useEffect, useState } from "react";

type Saved = { href: string; title: string };

// Lists what the service worker has kept in its pages cache. Titles come
// from the saved HTML itself, so no network is needed.
export function SavedPages() {
  const [pages, setPages] = useState<Saved[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("caches" in window)) {
        setPages([]);
        return;
      }
      try {
        const names = (await caches.keys()).filter((name) => name.startsWith("portpass-pages-"));
        const found: Saved[] = [];
        for (const name of names) {
          const cache = await caches.open(name);
          for (const request of await cache.keys()) {
            const url = new URL(request.url);
            if (url.pathname === "/offline") continue;
            const response = await cache.match(request);
            const html = response ? await response.text() : "";
            const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.replace(/\s*\|\s*PortPass Bahamas\s*$/, "").trim();
            found.push({ href: url.pathname, title: title || url.pathname });
          }
        }
        if (!cancelled) setPages(found);
      } catch {
        if (!cancelled) setPages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (pages === null) return null;
  if (!pages.length) return <p className="offline-empty">Nothing saved yet. Pages you visit will appear here.</p>;
  return (
    <ul className="offline-list">
      {pages.map((page) => (
        <li key={page.href}><a href={page.href}>{page.title}</a></li>
      ))}
    </ul>
  );
}
