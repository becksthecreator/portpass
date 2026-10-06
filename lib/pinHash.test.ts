import { createHash, randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPin, isLegacyPinHash, verifyPin } from "./pinHash";

// Brief 24, part D. The PINs here are drawn at random each run, so no PIN
// value is written in this file or in a test's name.
const somePin = () => String(randomInt(100000, 999999));

describe("staff PIN hashing", () => {
  it("stores scrypt with a salt of its own, so the same PIN never hashes the same twice", async () => {
    const pin = somePin();
    const first = await hashPin(pin);
    const second = await hashPin(pin);
    expect(first.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(first).not.toBe(second);
    expect(isLegacyPinHash(first)).toBe(false);
    expect(await verifyPin(pin, first)).toEqual({ ok: true, upgrade: false });
    expect(await verifyPin(pin, second)).toEqual({ ok: true, upgrade: false });
  });

  it("refuses a wrong PIN, an empty PIN and a stored value it cannot read", async () => {
    const pin = somePin();
    const stored = await hashPin(pin);
    const wrong = String((Number(pin) + 1) % 1000000).padStart(6, "0");
    expect(await verifyPin(wrong, stored)).toEqual({ ok: false, upgrade: false });
    expect(await verifyPin("", stored)).toEqual({ ok: false, upgrade: false });
    expect(await verifyPin(pin, "")).toEqual({ ok: false, upgrade: false });
    expect(await verifyPin(pin, "scrypt$oops")).toEqual({ ok: false, upgrade: false });
    expect(await verifyPin(pin, "bcrypt$16384$8$1$AAAA$BBBB")).toEqual({ ok: false, upgrade: false });
  });

  it("still accepts the old unsalted SHA-256 form, and says it is time to upgrade", async () => {
    const pin = somePin();
    const legacy = createHash("sha256").update(pin).digest("hex");
    expect(isLegacyPinHash(legacy)).toBe(true);
    expect(await verifyPin(pin, legacy)).toEqual({ ok: true, upgrade: true });
    const wrong = String((Number(pin) + 7) % 1000000).padStart(6, "0");
    expect(await verifyPin(wrong, legacy)).toEqual({ ok: false, upgrade: false });
  });
});
