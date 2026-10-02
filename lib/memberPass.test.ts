import { describe, expect, it } from "vitest";
import { CHECK_TICKET_MINUTES, checkPassCode, checkTicket, PASS_CODES_AHEAD, PASS_WINDOW_SECONDS, passCode, passWindow, ticketValid, upcomingPassCodes } from "./memberPass";
import { currentCode, parseStoredPass } from "./memberPassClient";

const SECRET = "TEST-not-a-real-secret";
const NUMBER = "PP-7K3Q";
// The start of a 30-second window.
const WINDOW = 60_000_000;
const START = WINDOW * PASS_WINDOW_SECONDS * 1000;

describe("the Member Pass code", () => {
  it("is six digits, the same for the same member and half minute, and changes with the half minute", () => {
    const code = passCode(SECRET, NUMBER, WINDOW);
    expect(code).toMatch(/^\d{6}$/);
    expect(passCode(SECRET, NUMBER, WINDOW)).toBe(code);
    expect(passWindow(START)).toBe(WINDOW);
    expect(passWindow(START + 29_999)).toBe(WINDOW);
    expect(passWindow(START + 30_000)).toBe(WINDOW + 1);
    // Twenty half minutes give (all but certainly) twenty different codes.
    expect(new Set(Array.from({ length: 20 }, (_, i) => passCode(SECRET, NUMBER, WINDOW + i))).size).toBeGreaterThanOrEqual(18);
  });

  it("is different for another member and with another secret", () => {
    const codes = (secret: string, number: string) => Array.from({ length: 8 }, (_, i) => passCode(secret, number, WINDOW + i)).join(",");
    expect(codes(SECRET, "PP-8M4R")).not.toBe(codes(SECRET, NUMBER));
    expect(codes("TEST-another-secret", NUMBER)).not.toBe(codes(SECRET, NUMBER));
  });

  it("works for 90 seconds and then fails, so a screenshot stops working", () => {
    const code = passCode(SECRET, NUMBER, WINDOW);
    expect(checkPassCode(SECRET, NUMBER, code, START)).toBe(true);
    expect(checkPassCode(SECRET, NUMBER, code, START + 89_999)).toBe(true);
    expect(checkPassCode(SECRET, NUMBER, code, START + 90_000)).toBe(false);
    expect(checkPassCode(SECRET, NUMBER, code, START + 10 * 60_000)).toBe(false);
  });

  it("allows for a phone whose clock runs half a minute fast, and no more", () => {
    expect(checkPassCode(SECRET, NUMBER, passCode(SECRET, NUMBER, WINDOW + 1), START)).toBe(true);
    expect(checkPassCode(SECRET, NUMBER, passCode(SECRET, NUMBER, WINDOW + 2), START)).toBe(false);
  });

  it("reads the code however it is typed, and refuses anything that isn't six digits", () => {
    const code = passCode(SECRET, NUMBER, WINDOW);
    expect(checkPassCode(SECRET, NUMBER, `${code.slice(0, 3)} ${code.slice(3)}`, START)).toBe(true);
    expect(checkPassCode(SECRET, NUMBER, code.slice(0, 5), START)).toBe(false);
    expect(checkPassCode(SECRET, NUMBER, `${code}1`, START)).toBe(false);
    expect(checkPassCode(SECRET, NUMBER, "", START)).toBe(false);
  });

  it("is never valid for another member's number, or when the server has no secret", () => {
    const code = passCode(SECRET, NUMBER, WINDOW);
    // Another member's codes for the same half minutes are their own.
    const theirs = [-2, -1, 0, 1].map((offset) => passCode(SECRET, "PP-8M4R", WINDOW + offset));
    expect(checkPassCode(SECRET, "PP-8M4R", code, START)).toBe(theirs.includes(code));
    expect(checkPassCode("", NUMBER, passCode("", NUMBER, WINDOW), START)).toBe(false);
  });
});

describe("the codes the pass page is given", () => {
  it("cover now and the next twelve minutes, one after another", () => {
    const now = START + 12_345;
    const codes = upcomingPassCodes(SECRET, NUMBER, now);
    expect(codes).toHaveLength(PASS_CODES_AHEAD);
    expect(codes[0]).toEqual({ code: passCode(SECRET, NUMBER, WINDOW), from: START, until: START + 30_000 });
    for (let i = 1; i < codes.length; i += 1) expect(codes[i].from).toBe(codes[i - 1].until);
    expect(codes[codes.length - 1].until - now).toBeGreaterThanOrEqual(10 * 60_000);
    // Each is the code the server will accept at that moment.
    for (const entry of codes) expect(checkPassCode(SECRET, NUMBER, entry.code, entry.from)).toBe(true);
  });

  it("shows the code for the moment, and nothing once they have run out", () => {
    const codes = upcomingPassCodes(SECRET, NUMBER, START);
    expect(currentCode(codes, START)?.code).toBe(codes[0].code);
    expect(currentCode(codes, START + 30_000)?.code).toBe(codes[1].code);
    expect(currentCode(codes, codes[codes.length - 1].until)).toBeNull();
    expect(currentCode(codes, START - 1)).toBeNull();
  });
});

describe("what the phone keeps", () => {
  const stored = (over: Record<string, unknown> = {}) => JSON.stringify({ firstName: "TEST", memberNumber: NUMBER, memberSince: "2026-10-01T12:00:00Z", codes: upcomingPassCodes(SECRET, NUMBER, START), offset: 0, ...over });

  it("is a first name, the member number and the codes: nothing else is read back", () => {
    const pass = parseStoredPass(stored({ email: "test-delete@test.portpass.local" }), START);
    expect(pass).toMatchObject({ firstName: "TEST", memberNumber: NUMBER, offset: 0 });
    expect(Object.keys(pass!).sort()).toEqual(["codes", "firstName", "memberNumber", "memberSince", "offset"]);
  });

  it("is treated as nothing when it is malformed or every code has expired", () => {
    expect(parseStoredPass(null, START)).toBeNull();
    expect(parseStoredPass("not json", START)).toBeNull();
    expect(parseStoredPass(stored({ codes: [{ code: "12345", from: 1, until: 2 }] }), START)).toBeNull();
    expect(parseStoredPass(stored({ firstName: 7 }), START)).toBeNull();
    expect(parseStoredPass(stored(), START + 13 * 60_000)).toBeNull();
    // The server's clock decides: a phone that is 13 minutes slow has run out too.
    expect(parseStoredPass(stored({ offset: 13 * 60_000 }), START)).toBeNull();
  });
});

describe("the ticket a valid check hands back", () => {
  it("lets that business record a perk for that member for ten minutes, and nobody else", () => {
    const ticket = checkTicket(SECRET, 7, NUMBER, START);
    expect(ticketValid(SECRET, 7, NUMBER, ticket, START)).toBe(true);
    expect(ticketValid(SECRET, 7, NUMBER, ticket, START + CHECK_TICKET_MINUTES * 60_000)).toBe(true);
    expect(ticketValid(SECRET, 7, NUMBER, ticket, START + CHECK_TICKET_MINUTES * 60_000 + 1)).toBe(false);
    expect(ticketValid(SECRET, 8, NUMBER, ticket, START)).toBe(false);
    expect(ticketValid(SECRET, 7, "PP-8M4R", ticket, START)).toBe(false);
    expect(ticketValid("TEST-another-secret", 7, NUMBER, ticket, START)).toBe(false);
    expect(ticketValid("", 7, NUMBER, ticket, START)).toBe(false);
  });

  it("can't be stretched or made up", () => {
    const ticket = checkTicket(SECRET, 7, NUMBER, START);
    const [expires, mac] = ticket.split(".");
    expect(ticketValid(SECRET, 7, NUMBER, `${Number(expires) + 60_000}.${mac}`, START)).toBe(false);
    expect(ticketValid(SECRET, 7, NUMBER, `${expires}.`, START)).toBe(false);
    expect(ticketValid(SECRET, 7, NUMBER, "", START)).toBe(false);
    expect(ticketValid(SECRET, 7, NUMBER, "abc.def", START)).toBe(false);
  });
});
