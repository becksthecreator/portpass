import { describe, expect, it } from "vitest";
import { encodeText, formatBits, qrToSvg, reedSolomonDivisor, reedSolomonRemainder } from "./qr";

// The arithmetic is checked against published vectors; the matrix against
// the fixed patterns every reader locates first. A decode with an
// independent reader is part of the deploy check for the /app page.
describe("qr: arithmetic", () => {
  it("computes the Reed-Solomon codewords of the ISO worked example (1-M, 'HELLO WORLD')", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomonRemainder(data, reedSolomonDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("produces the published format information bits", () => {
    expect(formatBits("L", 0)).toBe(0b111011111000100);
    expect(formatBits("M", 0)).toBe(0b101010000010010);
    expect(formatBits("M", 2)).toBe(0b101111001111100);
    expect(formatBits("H", 7)).toBe(0b000100000111011);
  });
});

describe("qr: matrix", () => {
  const url = "https://portpassbahamas.com/app?utm_source=qr";
  const qr = encodeText(url);

  it("picks the smallest version that fits and sizes the matrix from it", () => {
    expect(qr.version).toBe(4); // 45 bytes; 4-M holds 62, 3-M holds 42
    expect(qr.size).toBe(33);
    expect(qr.modules).toHaveLength(33);
    for (const row of qr.modules) expect(row).toHaveLength(33);
  });

  it("draws the three finder patterns, separators and the dark module", () => {
    const row = (y: number, from: number, to: number) => qr.modules[y].slice(from, to + 1).map((d) => (d ? 1 : 0)).join("");
    // Top-left finder: 7 dark, then ring, with the separator (row 7 / col 7) light.
    expect(row(0, 0, 7)).toBe("11111110");
    expect(row(1, 0, 7)).toBe("10000010");
    expect(row(3, 0, 7)).toBe("10111010");
    expect(row(7, 0, 7)).toBe("00000000");
    // Top-right and bottom-left finders.
    expect(row(0, 25, 32)).toBe("01111111");
    expect(row(32, 0, 7)).toBe("11111110");
    // Timing pattern alternates along row 6 between the finders.
    expect(row(6, 8, 24)).toBe("10101010101010101");
    // The always-dark module at (8, size - 8).
    expect(qr.modules[qr.size - 8][8]).toBe(true);
  });

  it("writes format information that decodes back to the chosen mask", () => {
    const bits = formatBits("M", qr.mask);
    const read: number[] = [];
    for (let i = 0; i <= 5; i++) read.push(qr.modules[i][8] ? 1 : 0);
    read.push(qr.modules[7][8] ? 1 : 0, qr.modules[8][8] ? 1 : 0, qr.modules[8][7] ? 1 : 0);
    for (let i = 9; i < 15; i++) read.push(qr.modules[8][14 - i] ? 1 : 0);
    const value = read.reduce((acc, bit, i) => acc | (bit << i), 0);
    expect(value).toBe(bits);
    // BCH check: after removing the XOR mask the 15-bit word has remainder 0.
    let rem = value ^ 0x5412;
    for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
    expect(rem).toBe(0);
  });

  it("is deterministic and renders to one SVG path", () => {
    expect(encodeText(url)).toEqual(qr);
    const svg = qrToSvg(qr, { border: 4 });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41"')).toBe(true);
    expect((svg.match(/<path /g) ?? []).length).toBe(1);
  });

  it("refuses text beyond version 10 instead of producing a wrong code", () => {
    expect(() => encodeText("x".repeat(214))).toThrow(/too long/i);
    expect(encodeText("x".repeat(213)).version).toBe(10);
  });
});
