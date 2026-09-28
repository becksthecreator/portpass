// A small QR Code encoder: byte mode, versions 1-10, error correction M by
// default. The /app page's QR (round 5, §6) goes on signs and flyers, so it
// is generated from code in this repo rather than fetched from a third
// party -- the repo has no image tooling and no QR dependency. Follows
// ISO/IEC 18004; the structure mirrors Project Nayuki's qrcodegen (MIT),
// cut down to what PortPass needs. lib/qr.test.ts checks the Reed-Solomon
// and format-bit arithmetic against published vectors and the matrix's
// fixed patterns; the deployed image is also decoded with an independent
// reader before anything is printed.

export type Ecc = "L" | "M" | "Q" | "H";

export type QrCode = {
  version: number;
  size: number;
  mask: number;
  // modules[y][x] -- true is dark.
  modules: boolean[][];
};

const ECC_FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };
const ECC_INDEX: Record<Ecc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const MAX_VERSION = 10;

// Indexed [ecc][version]; version 0 is unused.
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18], // L
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], // M
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24], // Q
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28], // H
];
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4], // L
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5], // M
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8], // Q
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8], // H
];

// ---- public API -------------------------------------------------------------

export function encodeText(text: string, ecc: Ecc = "M"): QrCode {
  const data = Array.from(new TextEncoder().encode(text));

  let version = 1;
  for (; version <= MAX_VERSION; version++) {
    if (4 + countBits(version) + data.length * 8 <= numDataCodewords(version, ecc) * 8) break;
  }
  if (version > MAX_VERSION) throw new Error(`Text too long for this encoder (${data.length} bytes; max version ${MAX_VERSION})`);

  // Segment: mode, count, bytes; then terminator, byte alignment, pad bytes.
  const capacityBits = numDataCodewords(version, ecc) * 8;
  const bits: number[] = [];
  appendBits(bits, 0x4, 4);
  appendBits(bits, data.length, countBits(version));
  for (const byte of data) appendBits(bits, byte, 8);
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(bits, pad, 8);

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
    dataCodewords.push(value);
  }
  const codewords = addEccAndInterleave(version, ecc, dataCodewords);

  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  drawFunctionPatterns(version, ecc, modules, isFunction);
  drawCodewords(codewords, modules, isFunction);

  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask, modules, isFunction);
    drawFormatBits(ecc, mask, modules, isFunction);
    const score = penaltyScore(modules);
    if (score < bestPenalty) {
      bestPenalty = score;
      bestMask = mask;
    }
    applyMask(mask, modules, isFunction); // masks are XOR: applying again undoes it
  }
  applyMask(bestMask, modules, isFunction);
  drawFormatBits(ecc, bestMask, modules, isFunction);

  return { version, size, mask: bestMask, modules };
}

// An SVG of the code with a quiet zone of `border` modules, dark modules as
// one path. Scales to any size; shape-rendering keeps module edges crisp.
export function qrToSvg(qr: QrCode, options: { border?: number; dark?: string; light?: string } = {}): string {
  const border = options.border ?? 4;
  const dark = options.dark ?? "#0B2A3C";
  const light = options.light ?? "#ffffff";
  const total = qr.size + border * 2;
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) parts.push(`M${x + border} ${y + border}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${light}"/><path d="${parts.join("")}" fill="${dark}"/></svg>`;
}

// ---- format and version information -------------------------------------------

// The 15 format bits (ECC level + mask, BCH-protected, XOR-masked), as
// placed in the matrix. Exported for the unit test.
export function formatBits(ecc: Ecc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

// ---- capacity -------------------------------------------------------------------

function countBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(version: number, ecc: Ecc): number {
  const idx = ECC_INDEX[ecc];
  return Math.floor(numRawDataModules(version) / 8) - ECC_CODEWORDS_PER_BLOCK[idx][version] * NUM_ERROR_CORRECTION_BLOCKS[idx][version];
}

// ---- error correction -----------------------------------------------------------

function addEccAndInterleave(version: number, ecc: Ecc, data: number[]): number[] {
  const idx = ECC_INDEX[ecc];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[idx][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[idx][version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const divisor = reedSolomonDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const eccBytes = reedSolomonRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0); // placeholder so every block has the long length
    blocks.push(dat.concat(eccBytes));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      // Skip the placeholder byte in the short blocks.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

// Generator polynomial for `degree` error-correction codewords. Exported for the unit test.
export function reedSolomonDivisor(degree: number): number[] {
  const result = Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

export function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

// GF(2^8) multiplication with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

// ---- drawing ----------------------------------------------------------------------

function drawFunctionPatterns(version: number, ecc: Ecc, modules: boolean[][], isFunction: boolean[][]) {
  const size = modules.length;
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  const positions = alignmentPositions(version);
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      const overlapsFinder = (i === 0 && j === 0) || (i === 0 && j === positions.length - 1) || (i === positions.length - 1 && j === 0);
      if (overlapsFinder) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(positions[i] + dx, positions[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFormatBits(ecc, 0, modules, isFunction); // reserves the cells; overwritten once the mask is chosen
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let i = 0, pos = size - 7; i < numAlign - 1; i++, pos -= step) result.splice(1, 0, pos);
  return result;
}

function drawFormatBits(ecc: Ecc, mask: number, modules: boolean[][], isFunction: boolean[][]) {
  const size = modules.length;
  const bits = formatBits(ecc, mask);
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the always-dark module
}

function drawCodewords(data: number[], modules: boolean[][], isFunction: boolean[][]) {
  const size = modules.length;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing column is skipped
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < data.length * 8) {
          modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

function applyMask(mask: number, modules: boolean[][], isFunction: boolean[][]) {
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert: boolean;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

// ---- mask evaluation (ISO 18004 §7.8.3.1) ---------------------------------------------

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

function penaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let result = 0;

  const scanLine = (get: (i: number) => boolean) => {
    let runColor = false;
    let runLength = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < size; i++) {
      const cell = get(i);
      if (cell === runColor) {
        runLength++;
        if (runLength === 5) result += PENALTY_N1;
        else if (runLength > 5) result++;
      } else {
        finderPenaltyAddHistory(runLength, history, size);
        if (!runColor) result += finderPenaltyCountPatterns(history) * PENALTY_N3;
        runColor = cell;
        runLength = 1;
      }
    }
    result += finderPenaltyTerminateAndCount(runColor, runLength, history, size) * PENALTY_N3;
  };
  for (let y = 0; y < size; y++) scanLine((x) => modules[y][x]);
  for (let x = 0; x < size; x++) scanLine((y) => modules[y][x]);

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += PENALTY_N2;
    }
  }

  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;
  return result;
}

function finderPenaltyCountPatterns(history: number[]): number {
  const n = history[1];
  const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
  return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
}

function finderPenaltyTerminateAndCount(currentRunColor: boolean, currentRunLength: number, history: number[], size: number): number {
  if (currentRunColor) {
    finderPenaltyAddHistory(currentRunLength, history, size);
    currentRunLength = 0;
  }
  currentRunLength += size;
  finderPenaltyAddHistory(currentRunLength, history, size);
  return finderPenaltyCountPatterns(history);
}

function finderPenaltyAddHistory(currentRunLength: number, history: number[], size: number) {
  if (history[0] === 0) currentRunLength += size;
  history.pop();
  history.unshift(currentRunLength);
}

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}
