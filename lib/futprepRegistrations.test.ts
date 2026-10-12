import { describe, expect, it } from "vitest";
import { missingRegistrationFields, type RegistrationCompleteness } from "./futprepRegistrations";

const complete: RegistrationCompleteness = {
  registration_status: "pending_details",
  child_dob: "2020-03-01",
  emergency_contact_name: "A",
  emergency_contact_phone: "+12425550100",
  allergies: "",
  medical_conditions: "",
  medications: "",
  special_needs: "",
  photo_consent: "no",
  signature_name: "P",
};

describe("what a pending registration still lacks (worked out on the server)", () => {
  it("counts an answered-with-nothing health question as answered", () => {
    expect(missingRegistrationFields(complete)).toEqual([]);
  });

  it("names each missing part in words, never a value", () => {
    const missing = missingRegistrationFields({ ...complete, child_dob: null, emergency_contact_phone: null, allergies: null, photo_consent: null, signature_name: null });
    expect(missing).toEqual(["date of birth", "emergency contact", "medical information", "photo/video consent", "parent signature"]);
  });

  it("asks nothing of a registration the parent has finished", () => {
    expect(missingRegistrationFields({ ...complete, registration_status: "pending", child_dob: null, allergies: null })).toEqual([]);
  });
});
