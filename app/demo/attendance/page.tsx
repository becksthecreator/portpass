import { AttendanceView } from "@/app/_components/attendance/AttendanceView";
import { requireDemo } from "@/lib/auth/demo";
import { DemoFrame } from "../DemoFrame";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance | Demo business | PortPass Bahamas", robots: { index: false, follow: false } };

// The demo's attendance register (brief 18, part B): three Saturdays
// marked, and one register left for the visitor to mark.
export default async function DemoAttendancePage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { org } = await requireDemo();
  const { session } = await searchParams;
  const sessionId = session && /^\d{1,12}$/.test(session) ? Number(session) : null;
  return (
    <DemoFrame crumbs={[{ label: "Attendance", href: "/demo/attendance" }]}>
      <AttendanceView organizationId={org.id} businessName={org.name} basePath="/demo/attendance" endpoint="/api/demo/attendance" sessionId={sessionId} homeHref="/demo/home" homeLabel="Back to the demo business" />
    </DemoFrame>
  );
}
