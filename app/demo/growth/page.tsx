import Link from "next/link";
import { GrowthReportView } from "@/app/_components/growth/GrowthReportView";
import { getGrowthReport } from "@/db/growth";
import { requireDemo } from "@/lib/auth/demo";
import { DemoFrame } from "../DemoFrame";

export const dynamic = "force-dynamic";
export const metadata = { title: "Growth report | Demo business | PortPass Bahamas", robots: { index: false, follow: false } };

// The demo's growth report (brief 18, part B): the report a real business
// gets, worked out from the demo's example registrations, payments,
// attendance and page visits.
export default async function DemoGrowthPage() {
  const { org } = await requireDemo();
  const report = await getGrowthReport({ id: org.id, name: org.name });
  return (
    <DemoFrame crumbs={[{ label: "Growth", href: "/demo/growth" }]}>
      <div className="eyebrow"><span className="eyebrow-dot" />Growth report</div>
      <h1>{org.name}</h1>
      <GrowthReportView report={report} />
      <p className="auth-alt"><Link href="/demo/home">Back to the demo business</Link></p>
    </DemoFrame>
  );
}
