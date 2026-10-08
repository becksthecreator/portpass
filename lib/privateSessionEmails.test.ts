import { describe, expect, it } from "vitest";
import { firstName, newRequestStaffEmail, requestDeclinedEmail, requestReceivedEmail, requestReferredEmail, type RequestFacts } from "./privateSessionEmails";

const facts: RequestFacts = {
  referenceCode: "FP-S0007",
  serviceName: "Private session · 60 min",
  date: "2026-10-12",
  startTime: "16:00",
  durationMinutes: 60,
  priceCents: 7000,
  coachName: "Coach TEST Thompson",
  parentName: "TEST Parent",
  parentPhone: "242-555-0123",
  childFirstName: "Tee",
  childAge: 8,
  locationPreference: "TEST field <Lyford Cay>",
};

describe("the private-session emails (Brief 29, part A)", () => {
  it("tell the parent the request is in, with the reference, what happens next, and that nothing is confirmed yet", () => {
    const { subject, html } = requestReceivedEmail(facts);
    expect(subject).toBe("We've got your request · FP-S0007");
    for (const part of ["FP-S0007", "Private session · 60 min", "Mon 12 Oct", "16:00", "60 minutes", "$70", "Coach TEST Thompson", "What happens next", "isn't confirmed yet", "cash at the session", "bank transfer"]) expect(html).toContain(part);
    expect(html).not.toContain("242-555-0123");
    expect(requestReceivedEmail({ ...facts, coachName: null, priceCents: null }).html).toContain("Any available coach");
    expect(requestReceivedEmail({ ...facts, coachName: null, priceCents: null }).html).toContain("to be confirmed");
  });

  it("tell the coach and the owner the essentials, with a link to the staff portal, and no more about the child than a first name and an age", () => {
    const { subject, html } = newRequestStaffEmail(facts, "https://portpassbahamas.com/futprep/staff/private-sessions");
    expect(subject).toBe("New private session request · FP-S0007 · Mon 12 Oct 16:00 · Private session · 60 min");
    for (const part of ["Tee, age 8", "TEST Parent · 242-555-0123", "$70", "TEST field &lt;Lyford Cay&gt;", "https://portpassbahamas.com/futprep/staff/private-sessions", "Coach TEST Thompson", "in the portal, not in this email"]) expect(html).toContain(part);
    expect(html).not.toMatch(/allerg|medical|medication|surname|date of birth|goal|focus/i);
    // The parent's free text (goal, notes) never travels by email: a parent
    // writes "asthma, needs breaks" there. The type has no field for it.
    expect("sessionGoal" in facts).toBe(false);
    expect(newRequestStaffEmail({ ...facts, coachName: null }, "https://x").html).toContain("any available coach");
  });

  it("decline and refer kindly, with the reason or the new coach, and say nothing is owed", () => {
    const declined = requestDeclinedEmail(facts, "The coach is away that week.");
    expect(declined.subject).toBe("About your Futprep request · FP-S0007");
    expect(declined.html).toContain("The coach is away that week.");
    expect(declined.html).toContain("Nothing is owed");
    const referred = requestReferredEmail(facts, "Coach TEST Two", "At a tournament that day.");
    expect(referred.subject).toBe("Your Futprep request is with Coach TEST Two · FP-S0007");
    expect(referred.html).toContain("Coach TEST Two");
    expect(referred.html).toContain("instead of Coach TEST Thompson");
    expect(referred.html).toContain("At a tournament that day.");
    expect(referred.html).toContain("nothing is owed");
  });

  it("use a first name only", () => {
    expect(firstName("  Tee Beckford ")).toBe("Tee");
    expect(firstName("Tee")).toBe("Tee");
  });
});
