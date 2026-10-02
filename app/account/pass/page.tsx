import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Member Pass | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// The Member Pass lives at /pass, a page the app can keep for offline use
// (nothing under /account is ever kept). This address signs the member in
// first, then sends them there.
export default async function AccountPassPage() {
  await requireSignedIn("/pass");
  redirect("/pass");
}
