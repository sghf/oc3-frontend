import type { ActionTarget } from "./ActionsMenu";

/** Usage reads at once: a long selection must not send them all together. */
const USAGE_BATCH = 8;

/**
 * The warnings of a deletion that removes the uses of its objects too: one line
 * per object in use, saying how many uses it has. `count` reads them for one object.
 */
export async function usageWarnings(
  targets: ActionTarget[],
  count: (id: string) => Promise<number>,
  text: (target: ActionTarget, uses: number) => string,
): Promise<string[]> {
  const warnings: string[] = [];
  for (let start = 0; start < targets.length; start += USAGE_BATCH) {
    const batch = targets.slice(start, start + USAGE_BATCH);
    const counts = await Promise.all(batch.map((target) => count(target.id)));
    batch.forEach((target, index) => {
      const uses = counts[index] ?? 0;
      if (uses > 0) warnings.push(text(target, uses));
    });
  }
  return warnings;
}
