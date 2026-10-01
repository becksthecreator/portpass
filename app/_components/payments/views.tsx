import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { listBusinessOfferings } from "@/db/business";
import {
  getPaymentRequest,
  getPaymentSettings,
  listOrgRequestPayments,
  listPaymentRequests,
  listPaymentTeam,
  prefillFromPrivateSession,
  prefillFromRegistration,
  prefillFromReservation,
  type Prefill,
} from "@/db/paymentRequests";
import { nassauToday, nassauLocalToIso } from "@/lib/futprepTerms";
import type { PaymentsAccess } from "@/lib/paymentRequests/access";
import { addDays, chaseList, defaultPrefix, methodsSetUp, money, requestTotals } from "@/lib/paymentRequests/rules";
import { ChaseList } from "./ChaseList";
import { PaymentSettingsForm } from "./PaymentSettingsForm";
import { PaymentTeam } from "./PaymentTeam";
import { PaymentsShell } from "./PaymentsShell";
import { RequestDetail } from "./RequestDetail";
import { RequestEditor, type EditorInitial } from "./RequestEditor";
import { RequestsBoard } from "./RequestsBoard";

// The Payments screens (brief 17, §2), rendered the same way through
// either door. Each takes the access the page's guard returned.

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "portpassbahamas.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const apiBase = (access: PaymentsAccess) => `/api/payments/orgs/${access.orgId}`;

function needsHowToPay(access: PaymentsAccess, configured: boolean) {
  if (configured) return null;
  return (
    <p className="pay-notice is-warn">
      Tell customers how to pay you before sending requests: your bank details, where to bring cash, your Kanoo wallet.{" "}
      <Link href={`${access.basePath}/settings`}>Add how customers pay →</Link>
    </p>
  );
}

// ---- Requests ---------------------------------------------------------------

export async function RequestsView({ access, filter }: { access: PaymentsAccess; filter?: string }) {
  const today = nassauToday();
  const monthStart = nassauLocalToIso(`${today.slice(0, 7)}-01T00:00`)!;
  const [requests, payments, settings] = await Promise.all([listPaymentRequests(access.orgId), listOrgRequestPayments(access.orgId, { fromIso: monthStart }), getPaymentSettings(access.orgId)]);
  const totals = requestTotals(requests, payments, today);
  const chase = chaseList(requests, today);
  const initialFilter = filter === "overdue" || filter === "paid" || filter === "all" || filter === "check" ? filter : "outstanding";

  return (
    <PaymentsShell access={access} tab="requests" title="Payment requests" lede="Send a request, the customer pays you directly, you mark it paid. PortPass never holds the money." chaseCount={chase.length}>
      {needsHowToPay(access, settings !== null && (settings.bankName !== "" || settings.transferInstructions !== "" || settings.cashNote !== "" || settings.kanooHandleOrPhone !== ""))}
      <dl className="pay-totals" aria-label="Totals">
        <div><dt>Collected this month</dt><dd>{money(totals.collectedThisMonthCents)}</dd></div>
        <div><dt>Outstanding</dt><dd>{money(totals.outstandingCents)}<small>{totals.outstandingCount} {totals.outstandingCount === 1 ? "request" : "requests"}</small></dd></div>
        <div className={totals.overdueCount > 0 ? "is-overdue" : undefined}><dt>Overdue</dt><dd>{money(totals.overdueCents)}<small>{totals.overdueCount} {totals.overdueCount === 1 ? "request" : "requests"}</small></dd></div>
      </dl>
      {totals.toCheckCount > 0 && (
        <p className="pay-notice is-check">
          {totals.toCheckCount === 1 ? "1 customer says they've paid." : `${totals.toCheckCount} customers say they've paid.`} Check your account or cash, then confirm.{" "}
          <Link href={`${access.basePath}?filter=check`}>Check and confirm →</Link>
        </p>
      )}
      <RequestsBoard rows={requests} basePath={access.basePath} apiBase={apiBase(access)} today={today} initialFilter={initialFilter} />
    </PaymentsShell>
  );
}

// ---- New / edit -------------------------------------------------------------

async function loadPrefill(orgId: number, params: Record<string, string | undefined>): Promise<Prefill | null | undefined> {
  const id = (value: string | undefined) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const registration = id(params.registration);
  if (registration) return prefillFromRegistration(orgId, registration);
  const session = id(params.privateSession);
  if (session) return prefillFromPrivateSession(orgId, session);
  const reservation = id(params.reservation);
  if (reservation) return prefillFromReservation(orgId, reservation);
  return undefined;
}

async function editorContext(access: PaymentsAccess) {
  const [settings, offerings] = await Promise.all([getPaymentSettings(access.orgId), listBusinessOfferings(access.orgId).catch(() => [])]);
  return {
    settings,
    methodsAvailable: methodsSetUp(settings),
    offerings: offerings.filter((o) => o.priceCents !== null && o.priceCents > 0).map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents! })),
  };
}

export async function NewRequestView({ access, params }: { access: PaymentsAccess; params: Record<string, string | undefined> }) {
  const today = nassauToday();
  const [{ settings, methodsAvailable, offerings }, prefill] = await Promise.all([editorContext(access), loadPrefill(access.orgId, params)]);
  if (prefill === null) notFound();
  const initial: EditorInitial = {
    customerName: prefill?.customer.name ?? "",
    customerEmail: prefill?.customer.email ?? "",
    customerPhone: prefill?.customer.phone ?? "",
    lines: prefill?.lines.length ? prefill.lines : [{ label: "", qty: 1, unitCents: 0 }],
    dueDate: addDays(today, settings?.defaultDueDays ?? 7),
    methods: methodsAvailable,
    allowPartPayment: false,
    offeringId: null,
    link: prefill?.link ?? {},
  };
  return (
    <PaymentsShell access={access} tab="new" title="New request" lede="Who it's for, what it's for, when it's due. Preview it, then send it.">
      {needsHowToPay(access, methodsAvailable.length > 1 || (settings?.cashNote ?? "") !== "")}
      {prefill && (
        <p className="pay-notice">
          From {prefill.source}.{" "}
          {prefill.lines.length === 0 && "Nothing is owing on it right now; add a line if you still want to ask for something."}
        </p>
      )}
      {prefill && prefill.openRequests.length > 0 && (
        <p className="pay-notice is-check">
          Already open for this:{" "}
          {prefill.openRequests.map((r, i) => (
            <span key={r.id}>{i > 0 && ", "}<Link href={`${access.basePath}/${r.id}`}>{r.referenceCode}</Link> ({money(r.balanceCents)} to pay)</span>
          ))}
          . Check it isn&rsquo;t a second request for the same thing.
        </p>
      )}
      <RequestEditor mode="new" apiBase={apiBase(access)} basePath={access.basePath} businessName={access.orgName} initial={initial} methodsAvailable={methodsAvailable} offerings={offerings} today={today} howToPay={settings} />
    </PaymentsShell>
  );
}

export async function EditRequestView({ access, requestId }: { access: PaymentsAccess; requestId: number }) {
  const [found, { settings, methodsAvailable, offerings }] = await Promise.all([getPaymentRequest(access.orgId, requestId), editorContext(access)]);
  if (!found) notFound();
  const r = found.request;
  const initial: EditorInitial = {
    customerName: r.customerName,
    customerEmail: r.customerEmail ?? "",
    customerPhone: r.customerPhone ?? "",
    lines: r.lines,
    dueDate: r.dueDate,
    methods: r.methods,
    allowPartPayment: r.allowPartPayment,
    offeringId: r.offeringId,
    link: {},
  };
  const available = [...new Set([...methodsAvailable, ...r.methods])];
  return (
    <PaymentsShell access={access} tab="detail" title={`Change ${r.referenceCode}`} lede="You can change a request until money is recorded against it.">
      {r.paidCents > 0 || r.status === "void" ? (
        <p className="pay-notice is-warn">This request can&rsquo;t be changed any more. <Link href={`${access.basePath}/${r.id}`}>Back to {r.referenceCode}</Link></p>
      ) : (
        <RequestEditor mode="edit" requestId={r.id} existingDueDate={r.dueDate} apiBase={apiBase(access)} basePath={access.basePath} businessName={access.orgName} initial={initial} methodsAvailable={available} offerings={offerings} today={nassauToday()} howToPay={settings} />
      )}
    </PaymentsShell>
  );
}

// ---- One request -------------------------------------------------------------

export async function RequestDetailView({ access, requestId, created }: { access: PaymentsAccess; requestId: number; created: boolean }) {
  const [found, origin] = await Promise.all([getPaymentRequest(access.orgId, requestId), siteOrigin()]);
  if (!found) notFound();
  const { request, payments } = found;
  return (
    <PaymentsShell access={access} tab="detail" title={request.referenceCode} lede={`${request.customerName} · created by ${request.createdByName || "the team"}`}>
      <RequestDetail request={request} payments={payments} businessName={access.orgName} basePath={access.basePath} apiBase={apiBase(access)} origin={origin} today={nassauToday()} created={created} />
    </PaymentsShell>
  );
}

// ---- Chase ---------------------------------------------------------------------

export async function ChaseView({ access }: { access: PaymentsAccess }) {
  const today = nassauToday();
  const [requests, origin] = await Promise.all([listPaymentRequests(access.orgId), siteOrigin()]);
  const overdue = chaseList(requests, today);
  return (
    <PaymentsShell access={access} tab="chase" title="Chase list" lede="Overdue requests, oldest first. A reminder goes only when you press the button, to one customer at a time." chaseCount={overdue.length}>
      <ChaseList rows={overdue} businessName={access.orgName} basePath={access.basePath} apiBase={apiBase(access)} origin={origin} today={today} />
    </PaymentsShell>
  );
}

// ---- Settings ----------------------------------------------------------------------

export async function SettingsView({ access }: { access: PaymentsAccess }) {
  const [settings, team] = await Promise.all([getPaymentSettings(access.orgId), access.door === "business" ? listPaymentTeam(access.orgId) : Promise.resolve([])]);
  return (
    <PaymentsShell access={access} tab="settings" title="How customers pay you" lede="Shown on every request's page. Customers pay you directly; PortPass never holds the money.">
      <PaymentSettingsForm apiBase={apiBase(access)} initial={settings} suggestedPrefix={settings?.referencePrefix ?? defaultPrefix(access.orgName)} canEdit={access.canEditSettings} />
      {access.door === "business" && <PaymentTeam apiBase={apiBase(access)} members={team} canManage={access.canManageTeam} />}
    </PaymentsShell>
  );
}
