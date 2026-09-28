import { describe, expect, it } from "vitest";
import { composeE164, splitE164, tidyNational } from "./PhoneInput";

describe("PhoneInput: reading a stored value", () => {
  it("recognises Bahamas, other NANP islands and the rest of the world from E.164", () => {
    expect(splitE164("+12424238161")).toEqual({ dial: "1242", digits: "4238161" });
    expect(splitE164("+18765551234")).toEqual({ dial: "1876", digits: "5551234" });
    expect(splitE164("+12125550100")).toEqual({ dial: "1", digits: "2125550100" });
    expect(splitE164("+447400123456")).toEqual({ dial: "44", digits: "7400123456" });
  });

  it("reads legacy free text Bahamas-first, like lib/phone.ts", () => {
    expect(splitE164("423-8161")).toEqual({ dial: "1242", digits: "4238161" });
    expect(splitE164("(242) 423-8161")).toEqual({ dial: "1242", digits: "4238161" });
    expect(splitE164("1-242-423-8161")).toEqual({ dial: "1242", digits: "4238161" });
    expect(splitE164("212-555-0100")).toEqual({ dial: "1", digits: "2125550100" });
    expect(splitE164("")).toEqual({ dial: "1242", digits: "" });
  });
});

describe("PhoneInput: what people type", () => {
  it("drops a typed area code or country prefix and caps the length", () => {
    expect(tidyNational("1242", "2424238161")).toBe("4238161");
    expect(tidyNational("1242", "12424238161")).toBe("4238161");
    expect(tidyNational("1242", "423-8161")).toBe("4238161");
    expect(tidyNational("1242", "2421234")).toBe("2421234");
    expect(tidyNational("1", "12125550100")).toBe("2125550100");
    expect(tidyNational("44", "07400 123456")).toBe("07400123456");
  });

  it("composes E.164 and returns an empty string for an empty number", () => {
    expect(composeE164("1242", "4238161")).toBe("+12424238161");
    expect(composeE164("44", "")).toBe("");
  });
});
