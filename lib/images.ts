// next/image only accepts local paths and the hosts in next.config.ts
// remotePatterns; anything else would throw at render. Photos come from
// public/ (seeded) or Supabase Storage (owner uploads), both optimisable;
// an unexpected host falls back to a plain <img> rather than a 500.
const OPTIMISABLE_HOSTS = [/\.supabase\.co$/i, /^images\.squarespace-cdn\.com$/i, /^images\.unsplash\.com$/i];

export function isOptimisableSrc(src: string): boolean {
  if (src.startsWith("/")) return true;
  try {
    const host = new URL(src).hostname;
    return OPTIMISABLE_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}
