/**
 * Exponential backoff with jitter for webhook retries.
 * attempt is 1-indexed (first retry is attempt=1).
 */
export function computeBackoff(attempt: number): number {
  const base = 1000; // 1s
  const cap = 6 * 60 * 60 * 1000; // 6h
  const exp = Math.min(cap, base * 2 ** (attempt - 1));
  const jitter = Math.random() * exp * 0.25;
  return Math.floor(exp + jitter);
}
