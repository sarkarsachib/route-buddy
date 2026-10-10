/**
 * Money is ALWAYS integer paise (1 INR = 100 paise). Never floats.
 * All helpers assert integer inputs so bugs surface loudly instead of
 * silently rounding.
 */
export type Paise = number;

export function assertPaise(v: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(v)) throw new Error(`${label} must be integer paise, got ${v}`);
  return v;
}

/** Multiply paise by basis points (1 bp = 0.01%) with round-half-up. */
export function applyBps(amount: Paise, bps: number): Paise {
  assertPaise(amount);
  if (!Number.isInteger(bps)) throw new Error("bps must be integer");
  return Math.floor((amount * bps + 5000) / 10000);
}

/** Integer ceil division for non-negative integers. */
export function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

export function formatINR(paise: Paise): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const r = rupees.toLocaleString("en-IN");
  return `${neg ? "−" : ""}₹${r}${p ? "." + String(p).padStart(2, "0") : ""}`;
}

/**
 * Split `total` across weights using largest-remainder so the parts sum
 * exactly to `total` (no paise lost or created).
 */
export function splitByWeights(total: Paise, weights: number[]): Paise[] {
  assertPaise(total, "total");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const base = Math.floor(total / weights.length);
    const out = weights.map(() => base);
    for (let i = 0; i < total - base * weights.length; i++) out[i] += 1;
    return out;
  }
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rem > 0; k = (k + 1) % order.length, rem--) floors[order[k].i] += 1;
  return floors;
}
