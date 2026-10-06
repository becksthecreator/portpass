import { securityTxt } from "@/lib/securityTxt";

// @public-route: /.well-known/security.txt is for anyone who finds a
// problem and wants to tell us (RFC 9116). Plain text, cached for a day.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(securityTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
