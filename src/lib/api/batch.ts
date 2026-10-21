import { problemText } from "./problem";
import type { components } from "./schema";

export type BatchOutcome = components["schemas"]["BatchOutcome"];

/** Objects sent per request to a batch route, under the 1000 it takes. */
const BATCH_SIZE = 500;

/**
 * Sends `items` to a batch route, BATCH_SIZE at a time one request after the
 * other, and returns for each item, in order, whether it succeeded and the
 * message of its outcome. The outcomes come back in the order sent; an item
 * without one, the request having failed or stopped short, takes the reason.
 */
export async function inBatches<T>(
  items: readonly T[],
  send: (batch: T[]) => Promise<{ data?: { data: BatchOutcome[] } | undefined; error?: unknown }>,
): Promise<{ item: T; ok: boolean; message: string }[]> {
  const results: { item: T; ok: boolean; message: string }[] = [];
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = items.slice(start, start + BATCH_SIZE);
    const { data, error } = await send(batch);
    const failed = error === undefined ? undefined : problemText(error);
    batch.forEach((item, index) => {
      const outcome = data?.data[index];
      if (outcome === undefined) {
        results.push({ item, ok: false, message: failed ?? "not applied" });
        return;
      }
      results.push({ item, ok: outcome.status < 400, message: outcome.info });
    });
  }
  return results;
}
