import type { OrgAccess } from "@/lib/auth/guards";

// Who may change the shop (brief 15): the business's owner or admins, and
// PortPass staff through the platform door. Staff can work the reservation
// list (paid, collected, release) but not edit products, drops or settings.
export function canEditShop(access: OrgAccess): boolean {
  if (access.via === "platform") return true;
  return access.membership?.role === "org_owner" || access.membership?.role === "org_admin";
}
