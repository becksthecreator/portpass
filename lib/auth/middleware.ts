import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authEnv } from "./env";

// Edge runtime: refreshes the auth cookies on every request that passes
// through middleware and answers exactly one question -- is there a
// session at all. Roles are never decided here; pages and route handlers
// derive them from the session server-side (lib/auth/guards.ts).
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; hasSession: boolean }> {
  let response = NextResponse.next({ request });
  const env = authEnv();
  if (!env) return { response, hasSession: false };

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  try {
    const { data } = await supabase.auth.getClaims();
    return { response, hasSession: Boolean(data?.claims) };
  } catch {
    return { response, hasSession: false };
  }
}

// /api/applications itself (the public /apply POST) stays open; its
// review endpoint /api/applications/[id] guards itself with requireAdminApi.
const SESSION_PREFIXES = ["/account", "/where-to", "/api/account", "/api/business", "/admin", "/organizations", "/api/admin"];

// /business itself is the public marketing page; everything under it
// (/business/setup, /business/[slug]/...) needs a session.
export function needsSession(pathname: string): boolean {
  if (pathname === "/business" || pathname === "/business/") return false;
  if (pathname.startsWith("/business/")) return true;
  return SESSION_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
