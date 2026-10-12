import { listPayCoaches, type PayCoach } from "./coachPay";
import { listAllCoachProfiles, listFutprepPrivateServices, type CoachProfile } from "./coaches";
import { listFutprepLocations } from "./futprepLocations";
import { futprepOrganizationId, listFutprepPrograms, type FutprepProgramSummary } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import type { FutprepLocation } from "@/lib/futprepLocations";
import type { PrivateService } from "@/lib/privateSessions";
import { roleCan, type FutprepRole } from "@/lib/futprepRoles";

// Futprep's operating map (brief 31, B2): programs, places and their
// costs, private sessions and who takes them, pay rates, and what's still
// missing, on one screen for the CEO and admin logins. Futprep's own rows
// only (found by its slug, never the demo business). Reads only. Everyone's
// class pay rates are the CEO's to see (lib/futprepRoles.ts "all_pay"), so
// `pay` is null for an admin.

export type OpsProgram = FutprepProgramSummary & { coachesOnDuty: number; childrenPerCoach: number | null };

export type OpsMap = {
  programs: OpsProgram[];
  locations: FutprepLocation[];
  services: PrivateService[];
  coaches: CoachProfile[];
  pay: PayCoach[] | null;
};

export async function loadOpsMap(role: FutprepRole): Promise<OpsMap> {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const [programs, locations, services, profiles, pay, { data: rules, error }] = await Promise.all([
    listFutprepPrograms(organizationId),
    listFutprepLocations(),
    listFutprepPrivateServices(),
    listAllCoachProfiles({ withLogin: true }),
    roleCan(role, "all_pay") ? listPayCoaches() : Promise.resolve(null),
    db.from("programs").select("id,default_coaches,children_per_coach").eq("organization_id", organizationId),
  ]);
  throwIfSupabaseError(error, "Could not load class sizes");
  const coaches: CoachProfile[] = profiles.coaches;
  const rule = new Map((rules ?? []).map((row) => [Number(row.id), { coaches: Number(row.default_coaches ?? 1), perCoach: row.children_per_coach === null ? null : Number(row.children_per_coach) }]));
  return {
    programs: programs.filter((program) => program.active).map((program) => ({ ...program, coachesOnDuty: rule.get(program.id)?.coaches ?? 1, childrenPerCoach: rule.get(program.id)?.perCoach ?? null })),
    locations,
    services,
    coaches: coaches.filter((coach) => coach.organization_id === organizationId),
    pay,
  };
}
