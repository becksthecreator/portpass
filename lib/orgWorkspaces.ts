// The existing staff tools each business already has, linked from its new
// /business/[slug] home rather than rebuilt. They still use their own PIN
// login until the accounts adapters land (accounts brief, block 6).
export type WorkspaceLink = { href: string; label: string; detail: string };

const WORKSPACES: Record<string, WorkspaceLink[]> = {
  futprep: [
    { href: "/futprep/staff/admin", label: "Registrations", detail: "Every child, payment status, edits" },
    { href: "/futprep/staff/coach", label: "Coach roster", detail: "Attendance, session plans" },
    { href: "/futprep/staff/ceo", label: "Overview", detail: "Sessions, plans, work logs" },
    { href: "/futprep/staff/programs", label: "Programs", detail: "Classes and terms" },
    { href: "/futprep/staff/private-sessions", label: "Private sessions", detail: "Requests and replies" },
  ],
  "bahamas-weddings": [
    { href: "/weddings/admin", label: "Wedding Desk inbox", detail: "Enquiries and their status" },
    { href: "/weddings/admin/packages", label: "Packages", detail: "Prices and inclusions" },
    { href: "/weddings/admin/gallery", label: "Gallery", detail: "Photos on the page" },
    { href: "/weddings/admin/content", label: "Site content", detail: "Reviews and proof" },
    { href: "/weddings/admin/availability", label: "Availability", detail: "Dates Antonio can't do" },
  ],
};

export function workspaceLinks(slug: string | null): WorkspaceLink[] {
  return slug ? WORKSPACES[slug] ?? [] : [];
}
