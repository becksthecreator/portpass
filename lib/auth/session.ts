import "server-only";
import { cache } from "react";
import { getProfile, listMemberships, type Membership, type PlatformRole, type Profile } from "@/db/accounts";
import { createAuthClient } from "./server";

export type Session = {
  userId: string;
  email: string | null;
  phone: string | null;
  profile: Profile | null;
  memberships: Membership[];
  platformRole: PlatformRole | null;
};

// One lookup per request (React cache): auth.getUser() validates the token
// with Supabase, then the service role reads what this user is -- never
// anything the browser claims.
export const getSession = cache(async (): Promise<Session | null> => {
  let client: Awaited<ReturnType<typeof createAuthClient>>;
  try {
    client = await createAuthClient();
  } catch {
    return null;
  }
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  return sessionForUser({ id: user.id, email: user.email ?? null, phone: user.phone ?? null });
});

export async function sessionForUser(user: { id: string; email: string | null; phone: string | null }): Promise<Session> {
  const [profile, memberships] = await Promise.all([getProfile(user.id), listMemberships(user.id)]);
  return {
    userId: user.id,
    email: user.email,
    phone: user.phone,
    profile,
    memberships,
    platformRole: profile?.platformRole ?? null,
  };
}

export function initialsFor(session: Session): string {
  const name = session.profile?.fullName?.trim() || session.email || "";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name.slice(0, 2) || "PP").toUpperCase();
}
