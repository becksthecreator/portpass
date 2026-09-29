import { NextRequest, NextResponse } from "next/server";
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE_SECONDS, attributionFromRequest, isFutprepPath, mergeAttribution, parseAttributionCookie, serializeAttributionCookie } from "@/lib/attribution";
import { needsSession, updateSession } from "@/lib/auth/middleware";

// Broadened from the old admin-only matcher so the domain-routing check
// below runs on every real page request. Still excludes _next and any
// path with a file extension (static assets, plus /robots.txt and
// /sitemap.xml, which read the Host header themselves and don't need
// rewriting -- see app/robots.ts, app/sitemap.ts).
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

const PLATFORM_HOST = "portpassbahamas.com";
const DOMAIN_CACHE_TTL_MS = 60_000;
// Paths that should resolve the same way regardless of which hostname the
// request came in on -- a business's own domain never needs to reach
// PortPass's admin surface, another business's /sites/ route, or the
// account/sign-in pages (those are PortPass's, not the business's).
const NEVER_REWRITE_PREFIXES = [
  "/api",
  "/admin",
  "/organizations",
  "/sites",
  "/icons",
  "/apple-icon",
  "/login",
  "/signup",
  "/account",
  "/where-to",
  "/business",
];

let domainCache: { map: Map<string, string>; fetchedAt: number } | null = null;

// Refetched at most once per DOMAIN_CACHE_TTL_MS -- a business's
// custom_domain doesn't change often enough to justify a database round
// trip on every request. Plain fetch() against PostgREST rather than the
// supabase-js client, since this runs on the Edge runtime and a lookup
// failure here should degrade to "serve the platform normally," never
// take the whole site down.
async function getDomainSlugMap(): Promise<Map<string, string>> {
  if (domainCache && Date.now() - domainCache.fetchedAt < DOMAIN_CACHE_TTL_MS) {
    return domainCache.map;
  }
  const map = new Map<string, string>();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/organizations?select=slug,custom_domain&custom_domain=not.is.null`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        const rows = (await res.json()) as { slug: string; custom_domain: string }[];
        for (const row of rows) map.set(row.custom_domain, row.slug);
      }
    } catch {
      // Fall through to an empty map for this cache window.
    }
  }
  domainCache = { map, fetchedAt: Date.now() };
  return map;
}

// Every business with a custom_domain renders through app/sites/[slug] --
// see that route and app/_components/BusinessShell.tsx. A new business
// goes live by setting that one column and adding the domain in Vercel;
// nothing here needs to change.
async function rewriteForCustomDomain(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  if (NEVER_REWRITE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const host = request.headers.get("host")?.replace(/^www\./, "").toLowerCase();
  if (!host || host === PLATFORM_HOST || host.endsWith(".vercel.app") || host.startsWith("localhost")) {
    return null;
  }

  const slug = (await getDomainSlugMap()).get(host);
  if (!slug) return null;

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${slug}${pathname}`;
  return NextResponse.rewrite(url);
}

export async function middleware(request: NextRequest) {
  const domainRewrite = await rewriteForCustomDomain(request);
  if (domainRewrite) return domainRewrite;

  // Refreshes the Supabase session cookies and says whether one exists.
  // Only "signed in or not" is decided here; what the person may do is
  // worked out server-side by lib/auth/guards.ts on each page and route.
  const { response, hasSession } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // Futprep growth tracking (28 Sept): remember how a visitor reached a
  // Futprep page -- UTM tags, an external referrer's host, or that they
  // came from another PortPass page -- in a first-party cookie for 30
  // days. Attribution only: no identifiers, no IP, no third-party pixels.
  // The registration page reads it and the server decides what it proves.
  if (isFutprepPath(pathname)) {
    const existing = parseAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE)?.value);
    const merged = mergeAttribution(existing, attributionFromRequest({ searchParams: request.nextUrl.searchParams, referer: request.headers.get("referer"), ownHost: request.headers.get("host") }));
    if (merged && (!existing || serializeAttributionCookie(merged) !== serializeAttributionCookie(existing))) {
      response.cookies.set(ATTRIBUTION_COOKIE, serializeAttributionCookie(merged), {
        maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
      });
    }
  }

  // The admin area (/admin, /organizations, /api/admin, the application
  // review endpoint) is covered here too: no session -> /login. The
  // platform role and the two-step check happen in lib/auth/admin.ts on
  // each page and handler; the old shared PIN is gone (28 Sept brief).
  if (needsSession(pathname) && !hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return response;
}
