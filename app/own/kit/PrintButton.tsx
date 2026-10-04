"use client";

export function PrintButton() {
  return <button className="primary-button" type="button" onClick={() => window.print()}>Print this sheet (A4)</button>;
}
