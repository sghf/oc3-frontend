import { api } from "./client";
import { problemText } from "./problem";
import type { components } from "./schema";

export type ActionEnqueue = components["schemas"]["ActionEnqueue"];

/**
 * Entries sent at once: the collector queues a list in one request, each entry
 * with its checks, within the request timeout of the api server.
 */
const CHUNK = 50;

/**
 * Queues agent actions as lists, CHUNK entries per request one after the other,
 * rather than a request per action: a selection of a thousand nodes makes twenty
 * requests, not a thousand at once. Returns, for each entry in order, the reason
 * it was refused, or null once queued; an entry given as a string is a refusal
 * already, kept as it is.
 */
export async function queueActionList(
  entries: readonly (ActionEnqueue | string)[],
): Promise<(string | null)[]> {
  const results: (string | null)[] = entries.map((entry) =>
    typeof entry === "string" ? entry : null,
  );
  const sendable = entries.flatMap((entry, index) =>
    typeof entry === "string" ? [] : [{ entry, index }],
  );
  for (let start = 0; start < sendable.length; start += CHUNK) {
    const chunk = sendable.slice(start, start + CHUNK);
    const { data, error } = await api.PUT("/actions", { body: chunk.map((item) => item.entry) });
    if (error !== undefined) {
      const message = problemText(error);
      for (const item of chunk) results[item.index] = message;
      continue;
    }
    // A list is answered with the refusals by index in the list sent.
    if ("refusals" in data) {
      for (const refusal of data.refusals) {
        const item = chunk[refusal.index];
        if (item !== undefined) results[item.index] = refusal.message;
      }
    }
  }
  return results;
}
