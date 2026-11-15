/**
 * Validate route parameters and numeric inputs representing positive Escrow trade IDs
 * before constructing a BigInt value.
 */
export function parseTradeIdParam(raw: unknown): bigint | null {
  const candidate = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : null) : raw;
  if (typeof candidate !== 'string') return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return null;
  }

  if (!/^[1-9]\d*$/.test(decoded)) {
    return null;
  }

  try {
    return BigInt(decoded);
  } catch {
    return null;
  }
}

/**
 * Safely normalizes a tradeId argument into a non-negative BigInt without throwing.
 * Returns 0n for malformed, empty, negative, or non-integer values.
 */
export function safeParseTradeId(value: bigint | number | string | null | undefined): bigint {
  if (typeof value === 'bigint') {
    return value > 0n ? value : 0n;
  }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : 0n;
  }
  if (typeof value === 'string') {
    return parseTradeIdParam(value) ?? 0n;
  }
  return 0n;
}
