import { NextResponse } from "next/server";
import { listOwnerEmails, updatePaymentMethods, type BankTransferDetails } from "@/db/business";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { sendBankDetailsChangedEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

// org_owner only: bank details are the one thing a compromised staff
// account must not be able to change. Every change is audit-logged in
// db/business.ts and emailed to every owner.
export async function PATCH(request: Request, ctx: Ctx) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_owner");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const methods = Array.isArray(body.paymentMethods) ? body.paymentMethods.filter((m): m is string => typeof m === "string") : [];
  if (methods.includes("card")) return NextResponse.json({ error: "Card payments aren't available yet." }, { status: 400 });

  let bank: BankTransferDetails | null = null;
  if (methods.includes("bank_transfer")) {
    const b = (body.bankTransferDetails ?? {}) as Record<string, unknown>;
    bank = {
      bank: str(b, "bank", 120),
      accountName: str(b, "accountName", 120),
      accountNumber: str(b, "accountNumber", 60),
      branch: str(b, "branch", 120),
      instructions: str(b, "instructions", 300),
    };
    if (!bank.bank || !bank.accountName || !bank.accountNumber) {
      return NextResponse.json({ error: "Bank transfer needs the bank, the account name and the account number." }, { status: 400 });
    }
  }

  try {
    const { business, bankDetailsChanged } = await updatePaymentMethods(id, auth.session.userId, { paymentMethods: methods, bankTransferDetails: bank });
    if (bankDetailsChanged) {
      const owners = await listOwnerEmails(id).catch(() => []);
      await sendBankDetailsChangedEmail({
        to: owners,
        businessName: business.name,
        changedBy: auth.session.profile?.fullName ?? auth.session.email ?? "a team member",
        settingsUrl: `https://portpassbahamas.com/business/${business.slug}/settings?step=5`,
      });
    }
    return NextResponse.json({ business, bankDetailsChanged });
  } catch (error) {
    if (error instanceof Error && error.message === "SUSPENDED") return NextResponse.json({ error: "This page is hidden by PortPass, so its bank details can't change right now. Message us and we'll sort it out." }, { status: 409 });
    console.error("payment methods save", error);
    return NextResponse.json({ error: "Could not save payment methods." }, { status: 500 });
  }
}
