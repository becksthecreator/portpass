import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFutprepStaff } from "../../../staff-auth";
import { getFutprepRegistrationDetail } from "@/db/staff";
import { getFutprepAvailability } from "@/db/registrations";
import { StaffLogoutButton } from "../../StaffLogoutButton";
import { RegistrationDetailEditor } from "./RegistrationDetailEditor";

export const dynamic = "force-dynamic";

export default async function FutprepRegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFutprepStaff(["admin", "ceo"], "/futprep/staff/admin");
  const { id } = await params;
  const registrationId = Number(id);
  if (!Number.isInteger(registrationId)) notFound();

  const [detail, availability] = await Promise.all([
    getFutprepRegistrationDetail(registrationId),
    getFutprepAvailability(),
  ]);
  if (!detail) notFound();

  const programs = availability.map((program) => ({
    slug: program.slug,
    name: program.name,
    weeklyFeeCents: program.weeklyFeeCents,
    termFeeCents: program.termFeeCents,
  }));

  return (
    <main className="staff-workspace theme-night">
      <header className="staff-workspace-header">
        <div>
          <Link className="brand" href="/"><BrandLogo /></Link>
          <span className="staff-workspace-label">Futprep · {detail.child_name}</span>
        </div>
        <nav>
          <Link href="/futprep/staff/admin">← Registration desk</Link>
          <StaffLogoutButton />
        </nav>
      </header>
      <section className="staff-workspace-content">
        <RegistrationDetailEditor detail={detail} programs={programs} />
      </section>
    </main>
  );
}
