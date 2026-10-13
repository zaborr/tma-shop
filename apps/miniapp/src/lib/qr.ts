/**
 * Small QR code generator (byte mode, error correction level M, versions 1–40),
 * following the ISO/IEC 18004 algorithm as laid out in Project Nayuki's
 * reference implementation. Returns the module matrix (true = dark).
 */

const ECC_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
  26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];
/** Format-information bits for error correction level M. */
const ECC_FORMAT_M = 0;

function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(ver: number): number {
  return Math.floor(rawDataModules(ver) / 8) - (ECC_PER_BLOCK_M[ver] ?? 0) * (BLOCKS_M[ver] ?? 0);
}

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j] ?? 0, root);
      if (j + 1 < result.length) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = (result[i] ?? 0) ^ gfMultiply(coef, factor);
    });
  }
  return result;
}

function bit(value: number, i: number): boolean {
  return ((value >>> i) & 1) !== 0;
}

export function encodeQr(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));

  // Smallest version that fits.
  let ver = 1;
  for (; ; ver += 1) {
    if (ver > 40) throw new Error('Text too long for a QR code');
    const countBits = ver <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  const size = ver * 4 + 17;

  // Data bits: byte mode, length, bytes, terminator and padding.
  const bits: number[] = [];
  const push = (value: number, len: number): void => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0x4, 4);
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  }

  // Error correction and interleaving.
  const numBlocks = BLOCKS_M[ver] ?? 1;
  const blockEcc = ECC_PER_BLOCK_M[ver] ?? 0;
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEcc);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const dat = data.slice(k, k + shortLen - blockEcc + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < (blocks[0]?.length ?? 0); i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - blockEcc || j >= numShort) codewords.push(block[i] ?? 0);
    });
  }

  // Function patterns.
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const setFunction = (x: number, y: number, dark: boolean): void => {
    const row = modules[y];
    const fRow = isFunction[y];
    if (!row || !fRow) return;
    row[x] = dark;
    fRow[x] = true;
  };
  for (let i = 0; i < size; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  if (ver > 1) {
    const numAlign = Math.floor(ver / 7) + 2;
    const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
    const positions = [6];
    for (let pos = size - 7; positions.length < numAlign; pos -= step) positions.splice(1, 0, pos);
    positions.forEach((px, i) => {
      positions.forEach((py, j) => {
        const corner =
          (i === 0 && j === 0) ||
          (i === 0 && j === numAlign - 1) ||
          (i === numAlign - 1 && j === 0);
        if (corner) return;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            setFunction(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      });
    });
  }
  const drawFormat = (mask: number): void => {
    const formatData = (ECC_FORMAT_M << 3) | mask;
    let rem = formatData;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fbits = ((formatData << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) setFunction(8, i, bit(fbits, i));
    setFunction(8, 7, bit(fbits, 6));
    setFunction(8, 8, bit(fbits, 7));
    setFunction(7, 8, bit(fbits, 8));
    for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, bit(fbits, i));
    for (let i = 0; i < 8; i += 1) setFunction(size - 1 - i, 8, bit(fbits, i));
    for (let i = 8; i < 15; i += 1) setFunction(8, size - 15 + i, bit(fbits, i));
    setFunction(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vbits = (ver << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, bit(vbits, i));
      setFunction(b, a, bit(vbits, i));
    }
  }

  // Data modules, zigzag from the bottom right.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        const row = modules[y];
        if (row && !isFunction[y]?.[x] && i < codewords.length * 8) {
          row[x] = bit(codewords[i >>> 3] ?? 0, 7 - (i & 7));
          i += 1;
        }
      }
    }
  }

  // Masks: pick the one with the lowest penalty.
  const masked = (mask: number): boolean[][] =>
    modules.map((row, y) =>
      row.map((dark, x) => {
        if (isFunction[y]?.[x]) return dark;
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        return dark !== invert;
      }),
    );
  let best: boolean[][] = modules;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    drawFormat(mask);
    const candidate = masked(mask);
    const score = penalty(candidate);
    if (score < bestPenalty) {
      bestPenalty = score;
      best = candidate;
    }
  }
  return best;
}

/** Simplified penalty (runs, 2×2 blocks, dark balance): enough to pick a readable mask. */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let result = 0;
  const runs = (get: (a: number, b: number) => boolean): void => {
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      for (let b = 1; b < size; b += 1) {
        if (get(a, b) === get(a, b - 1)) {
          run += 1;
          if (run === 5) result += 3;
          else if (run > 5) result += 1;
        } else run = 1;
      }
    }
  };
  runs((y, x) => m[y]?.[x] ?? false);
  runs((x, y) => m[y]?.[x] ?? false);
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const c = m[y]?.[x] ?? false;
      if (c) dark += 1;
      if (
        x + 1 < size &&
        y + 1 < size &&
        c === m[y]?.[x + 1] &&
        c === m[y + 1]?.[x] &&
        c === m[y + 1]?.[x + 1]
      ) {
        result += 3;
      }
    }
  }
  const total = size * size;
  result += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return result;
}
