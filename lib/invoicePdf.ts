import { howToPay, longDay, moneyExact, periodLabel, type BankDetails, type InvoiceStatus } from "./billing";
import { PORTPASS_PHONE_DISPLAY, PORTPASS_SUPPORT_EMAIL } from "./contact";

// A PortPass invoice as a PDF (brief 09, 2.5), laid out like
// PortPass_Invoice_Template.xlsx. Written by hand, with the two fonts every
// PDF reader has built in, so there is no library to keep up to date and
// the same invoice always produces the same file.
//
// VAT is shown as a 0.00 line and nothing more: no wording about VAT is
// published until the accountant confirms it.

export type PdfInvoice = {
  number: string;
  status: InvoiceStatus;
  issuedOn: string;
  dueOn: string;
  periodStart: string;
  periodEnd: string;
  businessName: string;
  billTo: string[];
  lines: Array<{ description: string; qty: number; unitCents: number; amountCents: number }>;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  paidCents: number;
  bank: BankDetails;
};

export const PORTPASS_LEGAL_NAME = "PortPass Bahamas Technologies";
export const PORTPASS_BUSINESS_NUMBER = "196489";

// US Letter, in points.
const WIDTH = 612;
const HEIGHT = 792;
const LEFT = 54;
const RIGHT = WIDTH - 54;

// Characters the built-in fonts can draw (WinAnsi). Anything else becomes "?".
const WIN_ANSI: Record<string, number> = { "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "…": 0x85 };

function encode(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 63;
    const byte = WIN_ANSI[char] ?? (code >= 32 && code <= 126 ? code : code >= 160 && code <= 255 ? code : 63);
    if (byte === 40 || byte === 41 || byte === 92) out += `\\${String.fromCharCode(byte)}`;
    else out += String.fromCharCode(byte);
  }
  return out;
}

// Helvetica's widths, in thousandths of the font size. Exact for what is
// right-aligned (digits and money punctuation), near enough for words.
function width(value: string, size: number): number {
  let units = 0;
  for (const char of value) {
    if (/[0-9$]/.test(char)) units += 556;
    else if (/[.,:;'| !]/.test(char)) units += 278;
    else if (char === "-") units += 333;
    else if (/[A-Z]/.test(char)) units += 667;
    else if (/[ijlt]/.test(char)) units += 250;
    else if (/[mw]/.test(char)) units += 800;
    else units += 520;
  }
  return (units * size) / 1000;
}

function wrap(value: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && width(next, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

class Page {
  ops: string[] = [];
  text(value: string, x: number, y: number, options: { size?: number; bold?: boolean; align?: "left" | "right"; grey?: boolean } = {}) {
    const size = options.size ?? 10;
    const at = options.align === "right" ? x - width(value, size) : x;
    this.ops.push(`BT /${options.bold ? "F2" : "F1"} ${size} Tf ${options.grey ? "0.4 g" : "0 g"} ${at.toFixed(2)} ${y.toFixed(2)} Td (${encode(value)}) Tj ET`);
  }
  rule(y: number, weight = 0.5) {
    this.ops.push(`${weight} w 0.75 G ${LEFT} ${y.toFixed(2)} m ${RIGHT} ${y.toFixed(2)} l S`);
  }
}

const COLUMN = { qty: 372, unit: 470, amount: RIGHT };

export function invoicePdf(invoice: PdfInvoice): Uint8Array {
  const pages: Page[] = [];
  let page = new Page();
  pages.push(page);
  let y = HEIGHT - 60;

  page.text("PORTPASS", LEFT, y, { size: 20, bold: true });
  page.text(invoice.status === "draft" ? "DRAFT INVOICE" : invoice.status === "void" ? "VOID INVOICE" : "INVOICE", RIGHT, y, { size: 20, bold: true, align: "right" });
  y -= 20;
  page.text(`${PORTPASS_LEGAL_NAME} · Business No. ${PORTPASS_BUSINESS_NUMBER}`, LEFT, y, { size: 9, grey: true });
  y -= 13;
  page.text("Nassau, The Bahamas", LEFT, y, { size: 9, grey: true });
  y -= 13;
  page.text(`${PORTPASS_SUPPORT_EMAIL} · ${PORTPASS_PHONE_DISPLAY}`, LEFT, y, { size: 9, grey: true });

  let side = HEIGHT - 82;
  for (const [label, value] of [["Invoice no.", invoice.number], ["Date", longDay(invoice.issuedOn)], ["Due date", longDay(invoice.dueOn)]] as const) {
    page.text(label, 400, side, { size: 9, grey: true });
    page.text(value, RIGHT, side, { size: 10, bold: label === "Invoice no.", align: "right" });
    side -= 14;
  }

  y -= 34;
  page.text("BILL TO", LEFT, y, { size: 8, bold: true, grey: true });
  y -= 15;
  page.text(invoice.businessName, LEFT, y, { size: 12, bold: true });
  for (const line of invoice.billTo.filter(Boolean)) {
    y -= 14;
    page.text(line, LEFT, y, { size: 10 });
  }
  y -= 20;
  page.text(`Period: ${periodLabel(invoice.periodStart, invoice.periodEnd)}`, LEFT, y, { size: 10 });

  const header = () => {
    y -= 26;
    page.text("Description", LEFT, y, { size: 8, bold: true, grey: true });
    page.text("Qty", COLUMN.qty, y, { size: 8, bold: true, grey: true, align: "right" });
    page.text("Unit price (BSD)", COLUMN.unit, y, { size: 8, bold: true, grey: true, align: "right" });
    page.text("Amount (BSD)", COLUMN.amount, y, { size: 8, bold: true, grey: true, align: "right" });
    y -= 7;
    page.rule(y, 1);
  };
  header();

  for (const line of invoice.lines) {
    const wrapped = wrap(line.description, 290, 10);
    if (y - wrapped.length * 13 - 16 < 150) {
      page = new Page();
      pages.push(page);
      y = HEIGHT - 40;
      header();
    }
    y -= 17;
    page.text(wrapped[0], LEFT, y);
    page.text(Number.isInteger(line.qty) ? String(line.qty) : line.qty.toFixed(2), COLUMN.qty, y, { align: "right" });
    page.text(moneyExact(line.unitCents), COLUMN.unit, y, { align: "right" });
    page.text(moneyExact(line.amountCents), COLUMN.amount, y, { align: "right" });
    for (const more of wrapped.slice(1)) {
      y -= 13;
      page.text(more, LEFT, y);
    }
    y -= 7;
    page.rule(y);
  }

  const totals: Array<[string, string, boolean]> = [["Subtotal", moneyExact(invoice.subtotalCents), false], ["VAT", moneyExact(invoice.vatCents), false], ["TOTAL DUE (BSD)", moneyExact(invoice.totalCents), true]];
  if (invoice.paidCents > 0) totals.push(["Received", moneyExact(invoice.paidCents), false], ["Balance (BSD)", moneyExact(Math.max(0, invoice.totalCents - invoice.paidCents)), true]);
  y -= 6;
  for (const [label, value, bold] of totals) {
    y -= 17;
    page.text(label, COLUMN.unit, y, { size: bold ? 11 : 10, bold, align: "right" });
    page.text(value, COLUMN.amount, y, { size: bold ? 11 : 10, bold, align: "right" });
  }

  y -= 38;
  page.text("HOW TO PAY", LEFT, y, { size: 8, bold: true, grey: true });
  for (const line of wrap(howToPay(invoice.bank), RIGHT - LEFT, 10)) {
    y -= 15;
    page.text(line, LEFT, y);
  }
  y -= 15;
  page.text(`Please use the invoice number (${invoice.number}) as your payment reference.`, LEFT, y);

  for (const [index, line] of wrap("PortPass never deducts its fees from your customers' payments. This invoice is how we are paid. Thank you for building with PortPass.", RIGHT - LEFT, 8).entries()) {
    pages[pages.length - 1].text(line, LEFT, 56 - index * 11, { size: 8, grey: true });
  }

  // ---- the file itself -----------------------------------------------------------
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  const pageIds = pages.map((_, index) => 5 + index * 2);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  for (const [index, p] of pages.entries()) {
    const stream = p.ops.join("\n");
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`);
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let file = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(file.length);
    file += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info << /Title (${encode(`${PORTPASS_LEGAL_NAME} invoice ${invoice.number}`)}) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character above is one byte (see encode), so the offsets are right.
  return Uint8Array.from(file, (char) => char.charCodeAt(0) & 0xff);
}
