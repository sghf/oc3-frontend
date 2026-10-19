import type { operations } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/** The body of POST /compliance/import: the filtersets, rulesets and modulesets of an export. */
export type ImportDump = NonNullable<
  operations["PostComplianceImport"]["requestBody"]
>["content"]["application/json"];

/** The kinds a dump holds, and the prop naming an object of each. */
export const DUMP_KINDS = [
  { key: "filtersets", nameProp: "fset_name" },
  { key: "rulesets", nameProp: "ruleset_name" },
  { key: "modulesets", nameProp: "modset_name" },
] as const;
export type DumpKind = (typeof DUMP_KINDS)[number]["key"];

/** What a pasted or loaded dump holds, once read: the objects by kind, or why it cannot be imported. */
export type ParsedDump =
  | { ok: true; dump: ImportDump; names: Record<DumpKind, string[]>; ignored: string[] }
  | { ok: false; reason: "empty" | "json" | "shape" | "nothing"; detail?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value has the shape of a dump: an object whose filtersets, rulesets
 * and modulesets, those present, are lists of objects named by their name prop.
 * The rest is checked by the collector, which refuses the whole import otherwise.
 */
function isDump(value: unknown): value is ImportDump {
  if (!isRecord(value)) return false;
  return DUMP_KINDS.every(({ key, nameProp }) => {
    const list = value[key];
    return (
      list === undefined ||
      (Array.isArray(list) &&
        list.every((item) => isRecord(item) && typeof item[nameProp] === "string"))
    );
  });
}

/**
 * Reads the text of a dump, as the compliance exports write it (the designer's
 * export, or the historical collector's): its objects by kind, the top-level keys
 * the import does not know, which it ignores, or why it cannot be imported.
 */
export function parseDump(text: string): ParsedDump {
  if (text.trim() === "") return { ok: false, reason: "empty" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: "json", detail: error instanceof Error ? error.message : "" };
  }
  if (!isDump(value)) return { ok: false, reason: "shape" };
  const known = new Set<string>(DUMP_KINDS.map(({ key }) => key));
  const ignored = Object.keys(value).filter((key) => !known.has(key));
  const names: Record<DumpKind, string[]> = { filtersets: [], rulesets: [], modulesets: [] };
  const dump: ImportDump = {};
  if (value.filtersets !== undefined) {
    dump.filtersets = value.filtersets;
    names.filtersets = value.filtersets.map((item) => item.fset_name);
  }
  if (value.rulesets !== undefined) {
    dump.rulesets = value.rulesets;
    names.rulesets = value.rulesets.map((item) => item.ruleset_name ?? "");
  }
  if (value.modulesets !== undefined) {
    dump.modulesets = value.modulesets;
    names.modulesets = value.modulesets.map((item) => item.modset_name ?? "");
  }
  if (DUMP_KINDS.every(({ key }) => names[key].length === 0))
    return { ok: false, reason: "nothing" };
  return { ok: true, dump, names, ignored };
}

/** Imports a dump: what the collector added and what already existed, one line each. */
export async function importDump(dump: ImportDump): Promise<string[]> {
  const { data, error } = await api.POST("/compliance/import", { body: dump });
  if (error !== undefined) throw new Error(problemText(error));
  return data.info ?? [];
}

/** The objects of a list, one per name, in the order of their names. */
function byName<T>(lists: (T[] | undefined)[], name: (item: T) => string): T[] {
  const kept = new Map<string, T>();
  for (const list of lists) for (const item of list ?? []) kept.set(name(item), item);
  return [...kept.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item);
}

/**
 * The compliance as the collector holds it for the user, in the format of the
 * import: the rulesets and modulesets published to them, with the rulesets and
 * filtersets they use, each once, sorted by name. The pending changes of the
 * designer are not in it: they are not in the collector yet.
 */
export async function exportCompliance(): Promise<ImportDump> {
  const [rulesets, modulesets] = await Promise.all([
    api.GET("/compliance/rulesets/export"),
    api.GET("/compliance/modulesets/export"),
  ]);
  if (rulesets.error !== undefined) throw new Error(problemText(rulesets.error));
  if (modulesets.error !== undefined) throw new Error(problemText(modulesets.error));
  return {
    filtersets: byName(
      [rulesets.data.filtersets, modulesets.data.filtersets],
      (item) => item.fset_name,
    ),
    rulesets: byName(
      [rulesets.data.rulesets, modulesets.data.rulesets],
      (item) => item.ruleset_name ?? "",
    ),
    modulesets: byName([modulesets.data.modulesets], (item) => item.modset_name ?? ""),
  };
}

/** The name of an export file, dated to the minute: compliance-20261019-1530.json. */
export function exportFileName(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `compliance-${String(at.getFullYear())}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.json`;
}
