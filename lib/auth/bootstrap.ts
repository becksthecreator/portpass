import "server-only";
import {
  createPerson,
  findPersonByEmail,
  findPersonByUser,
  getProfile,
  linkPersonToUser,
  linkRegistrationsToPerson,
  listPendingInvitesForEmail,
  markInviteAccepted,
  markOrganizationClaimed,
  recordLegalAcceptance,
  upsertMembership,
  upsertProfile,
} from "@/db/accounts";
import { logAudit } from "@/db/audit";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/lib/legal";
import { platformOwnerEmails } from "./env";

type AuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Runs right after a code is verified, every time (idempotent): makes sure
// the profile exists, grants platform_owner to the configured founders,
// accepts any open invites for this email, and links the person record so
// earlier bookings show up. Nothing here trusts the browser -- the only
// inputs are the verified user and what they typed at sign-up (name, phone),
// which Supabase stored as user_metadata.
export async function bootstrapUser(user: AuthUser): Promise<void> {
  const email = user.email?.trim().toLowerCase() ?? null;
  const meta = user.user_metadata ?? null;
  const existing = await getProfile(user.id);

  const fullName = metaString(meta, "full_name") ?? existing?.fullName ?? (email ? email.split("@")[0] : "PortPass member");
  const phoneFromSignup = metaString(meta, "phone_e164");
  const isFounder = email !== null && platformOwnerEmails().includes(email);
  const platformRole = existing?.platformRole ?? (isFounder ? "platform_owner" : null);

  await upsertProfile({
    userId: user.id,
    fullName,
    phoneE164: phoneFromSignup ?? existing?.phoneE164 ?? user.phone ?? null,
    platformRole,
  });

  // A new account: note the Terms and Privacy versions they signed up under.
  // Never a reason to fail the sign-in itself: the one-time code is already
  // spent by now, so a hiccup here would lock a new person out.
  if (!existing) {
    await recordLegalAcceptance(user.id, { terms: TERMS_OF_SERVICE.version, privacy: PRIVACY_POLICY.version }).catch((error) => {
      console.error("bootstrap: legal acceptance not recorded", (error as { code?: string } | null)?.code ?? "");
    });
  }

  if (!existing && isFounder) {
    await logAudit({ actorUserId: user.id, action: "profile.platform_owner_granted", targetTable: "profiles", targetId: user.id, after: { email } });
  }

  if (email) {
    for (const invite of await listPendingInvitesForEmail(email)) {
      await upsertMembership({
        organizationId: invite.organizationId,
        userId: user.id,
        role: invite.role,
        canViewMedical: invite.canViewMedical,
        invitedBy: invite.invitedBy,
      });
      await markInviteAccepted(invite.id);
      if (invite.role === "org_owner") await markOrganizationClaimed(invite.organizationId);
      await logAudit({
        actorUserId: user.id,
        organizationId: invite.organizationId,
        action: "invite.accepted",
        targetTable: "organization_invites",
        targetId: invite.id,
        after: { role: invite.role, can_view_medical: invite.canViewMedical },
      });
    }

    let person = await findPersonByUser(user.id);
    if (!person) {
      const byEmail = await findPersonByEmail(email);
      if (byEmail && !byEmail.authUserId) {
        await linkPersonToUser(byEmail.id, user.id);
        person = byEmail;
      } else if (!byEmail) {
        person = await createPerson({ name: fullName, email, phoneE164: phoneFromSignup ?? user.phone ?? null, authUserId: user.id });
      }
    }
    // Guest registrations made with this email now belong to the account
    // (speed & sign-in brief, 2.1). Idempotent: only unlinked rows move.
    if (person) {
      const linked = await linkRegistrationsToPerson(person.id, email).catch((error) => {
        console.error("bootstrap: linking registrations failed", error);
        return 0;
      });
      if (linked > 0) await logAudit({ actorUserId: user.id, action: "registrations.linked_to_account", targetTable: "registrations", targetId: person.id, after: { linked } });
    }
  }
}
