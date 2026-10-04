import { describe, expect, it } from "vitest";
import { proofSentence } from "./businessProof";

describe("the proof line on /business", () => {
  it("says only what the counts support", () => {
    expect(proofSentence({ name: "TEST Kickers", registered: 18, paymentsRecorded: 16 })).toBe("TEST Kickers: 18 children registered and their payments recorded on PortPass.");
    expect(proofSentence({ name: "TEST Kickers", registered: 1, paymentsRecorded: 0 })).toBe("TEST Kickers: 1 child registered on PortPass.");
  });
});
