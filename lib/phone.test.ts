import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, normalizePhoneE164 } from "./phone";

describe("normalizePhoneE164", () => {
  it("treats a bare 7-digit number as a Bahamas (242) number", () => {
    expect(normalizePhoneE164("4238161")).toBe("+12424238161");
    expect(normalizePhoneE164("423-8161")).toBe("+12424238161");
  });

  it("accepts the usual 10- and 11-digit North American spellings", () => {
    expect(normalizePhoneE164("(242) 423-8161")).toBe("+12424238161");
    expect(normalizePhoneE164("242.423.8161")).toBe("+12424238161");
    expect(normalizePhoneE164("1-242-423-8161")).toBe("+12424238161");
    expect(normalizePhoneE164("+1 242 423 8161")).toBe("+12424238161");
  });

  it("keeps other countries when the caller gave a + or 00 prefix", () => {
    expect(normalizePhoneE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhoneE164("0044 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects things that can't be dialled", () => {
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164("12")).toBeNull();
    expect(normalizePhoneE164("call me")).toBeNull();
    expect(normalizePhoneE164("+1")).toBeNull();
    expect(normalizePhoneE164("12345678901234567")).toBeNull();
  });
});

describe("formatPhoneDisplay", () => {
  it("formats North American numbers and leaves others alone", () => {
    expect(formatPhoneDisplay("+12424238161")).toBe("+1 (242) 423-8161");
    expect(formatPhoneDisplay("+442079460958")).toBe("+442079460958");
  });
});
