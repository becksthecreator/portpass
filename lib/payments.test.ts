import { describe, expect, it } from "vitest";
import { derivePaymentStatus } from "./payments";

describe("derivePaymentStatus", () => {
  it("weekly plans are paid as soon as anything has been received", () => {
    expect(
      derivePaymentStatus({ paymentFrequency: "weekly", paidCents: 1, amountDueCents: 3500 }),
    ).toBe("paid");
  });

  it("weekly plans are pending until any payment lands", () => {
    expect(
      derivePaymentStatus({ paymentFrequency: "weekly", paidCents: 0, amountDueCents: 3500 }),
    ).toBe("pending");
  });

  it("term plans are pending with nothing paid", () => {
    expect(
      derivePaymentStatus({ paymentFrequency: "term", paidCents: 0, amountDueCents: 30000 }),
    ).toBe("pending");
  });

  it("term plans are partial when something but not enough has been paid", () => {
    expect(
      derivePaymentStatus({ paymentFrequency: "term", paidCents: 15000, amountDueCents: 30000 }),
    ).toBe("partial");
  });

  it("term plans are paid once the full amount is received", () => {
    expect(
      derivePaymentStatus({ paymentFrequency: "term", paidCents: 30000, amountDueCents: 30000 }),
    ).toBe("paid");
  });

  it("term plans stay paid on an overpayment rather than reporting partial", () => {
    expect(
      derivePaymentStatus({ paymentFrequency: "term", paidCents: 35000, amountDueCents: 30000 }),
    ).toBe("paid");
  });
});
