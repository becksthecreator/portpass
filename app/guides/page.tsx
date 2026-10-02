import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { listPublishedGuides } from "@/db/guides";
import "./guides.css";

export const revalidate = 300;

const TITLE = "Guides to Nassau and The Bahamas | PortPass Bahamas";
const DESCRIPTION = "Guides from PortPass: things to do with kids in Nassau, sports programmes, parties, weddings and a day in port, with places you can book.";

const BASE: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://portpassbahamas.com/guides" },
  openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: DESCRIPTION, url: "https://portpassbahamas.com/guides" },
};

// Every published guide. While none is published the page says so and
// stays out of search (noindex below), rather than being an empty page.
export async function generateMetadata(): Promise<Metadata> {
  const guides = await listPublishedGuides();
  return guides.length ? BASE : { ...BASE, robots: { index: false, follow: true } };
}

export default async function GuidesPage() {
  const guides = await listPublishedGuides();
  return (
    <main className={`tpl-page guide-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Guides", href: "/guides" }]} />
      <article className="guide-article">
        <header>
          <span className="guide-eyebrow">PortPass</span>
          <h1>Guides</h1>
          <p className="guide-updated">Written by the people behind PortPass, with places you can book.</p>
        </header>
        {guides.length === 0 ? (
          <p className="guide-none">The first guides are being written. In the meantime, <Link href="/">browse what you can book</Link>.</p>
        ) : (
          <ul className="guide-list">
            {guides.map((guide) => (
              <li key={guide.slug}>
                <Link href={`/guides/${guide.slug}`}><b>{guide.title}</b>{guide.description && <small>{guide.description}</small>}</Link>
              </li>
            ))}
          </ul>
        )}
      </article>
      <SiteFooter />
    </main>
  );
}
