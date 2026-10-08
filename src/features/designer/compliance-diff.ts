import type { components } from "@/lib/api/schema";

type Export = components["schemas"]["ComplianceExport"];
type ExportRuleset = components["schemas"]["CompExportRuleset"];
type ExportModuleset = components["schemas"]["CompExportModuleset"];
type ExportFilterset = components["schemas"]["FiltersetExportItem"];

/**
 * What changed between two versions of the compliance export, object by object:
 * the versions are compared by object id, so that a renamed object reads as a
 * rename rather than as one deleted and another created.
 */

export type HistoryObjectKind = "moduleset" | "ruleset" | "filterset";

/** A property of an object that changed: a value, or a list with its gains and losses. */
export interface FieldChange {
  field:
    | "name"
    | "type"
    | "public"
    | "filterset"
    | "variables"
    | "modules"
    | "rulesets"
    | "modulesets"
    | "publications"
    | "responsibles"
    | "filters";
  from?: string;
  to?: string;
  added?: string[];
  removed?: string[];
  /** Items of a list present in both versions, but changed: a variable's value, a module's autofix. */
  changed?: string[];
}

export interface ObjectChange {
  kind: HistoryObjectKind;
  id: number;
  /** The name in the newer version, or the last one known for a deleted object. */
  name: string;
  status: "created" | "deleted" | "modified";
  /** The properties that changed, for a modified object. */
  fields: FieldChange[];
}

const KIND_ORDER: Record<HistoryObjectKind, number> = { moduleset: 0, ruleset: 1, filterset: 2 };

/** The changes of `after` from `before`, modulesets first, then by name; `before` absent for the first version. */
export function diffExports(before: Export | undefined, after: Export): ObjectChange[] {
  const changes = [
    ...diffKind("moduleset", before?.modulesets ?? [], after.modulesets, modulesetFields),
    ...diffKind("ruleset", before?.rulesets ?? [], after.rulesets, rulesetFields),
    ...diffKind("filterset", before?.filtersets ?? [], after.filtersets, filtersetFields),
  ];
  return changes.sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name),
  );
}

function diffKind<T extends { id?: number }>(
  kind: HistoryObjectKind,
  before: readonly T[],
  after: readonly T[],
  fields: (from: T, to: T) => FieldChange[],
): ObjectChange[] {
  const name = (o: T) => nameOf(kind, o);
  const old = new Map(before.flatMap((o) => (o.id === undefined ? [] : [[o.id, o] as const])));
  const changes: ObjectChange[] = [];
  for (const object of after) {
    if (object.id === undefined) continue;
    const previous = old.get(object.id);
    old.delete(object.id);
    if (previous === undefined) {
      changes.push({ kind, id: object.id, name: name(object), status: "created", fields: [] });
      continue;
    }
    const changed = fields(previous, object);
    if (changed.length > 0)
      changes.push({
        kind,
        id: object.id,
        name: name(object),
        status: "modified",
        fields: changed,
      });
  }
  for (const [id, object] of old)
    changes.push({ kind, id, name: name(object), status: "deleted", fields: [] });
  return changes;
}

function nameOf(kind: HistoryObjectKind, o: unknown): string {
  const object = o as ExportRuleset & ExportModuleset & ExportFilterset;
  if (kind === "ruleset") return object.ruleset_name ?? "";
  if (kind === "moduleset") return object.modset_name ?? "";
  return object.fset_name;
}

function value(field: FieldChange["field"], from: string, to: string): FieldChange[] {
  return from === to ? [] : [{ field, from, to }];
}

/** The gains and losses of a list of names. */
function list(
  field: FieldChange["field"],
  from: readonly string[] = [],
  to: readonly string[] = [],
) {
  const added = to.filter((n) => !from.includes(n));
  const removed = from.filter((n) => !to.includes(n));
  return added.length === 0 && removed.length === 0 ? [] : [{ field, added, removed }];
}

/**
 * A list of named items: those added, removed, and changed, an item being the
 * same when `same` says so (the author and date of a variable left aside).
 */
function items<I>(
  field: FieldChange["field"],
  from: readonly I[] = [],
  to: readonly I[] = [],
  name: (item: I) => string,
  differs: (a: I, b: I) => string | null,
): FieldChange[] {
  const old = new Map(from.map((i) => [name(i), i]));
  const added: string[] = [];
  const changed: string[] = [];
  for (const item of to) {
    const previous = old.get(name(item));
    old.delete(name(item));
    if (previous === undefined) added.push(name(item));
    else {
      const what = differs(previous, item);
      if (what !== null) changed.push(what);
    }
  }
  const removed = [...old.keys()];
  return added.length === 0 && removed.length === 0 && changed.length === 0
    ? []
    : [{ field, added, removed, changed }];
}

function rulesetFields(a: ExportRuleset, b: ExportRuleset): FieldChange[] {
  return [
    ...value("name", a.ruleset_name ?? "", b.ruleset_name ?? ""),
    ...value("type", a.ruleset_type ?? "", b.ruleset_type ?? ""),
    ...value("public", a.ruleset_public ?? "", b.ruleset_public ?? ""),
    ...value("filterset", a.fset_name ?? "", b.fset_name ?? ""),
    ...items(
      "variables",
      a.variables,
      b.variables,
      (v) => v.var_name ?? "",
      (x, y) =>
        x.var_value === y.var_value && x.var_class === y.var_class ? null : (y.var_name ?? ""),
    ),
    ...list("rulesets", a.rulesets, b.rulesets),
    ...list("publications", a.publications, b.publications),
    ...list("responsibles", a.responsibles, b.responsibles),
  ];
}

function modulesetFields(a: ExportModuleset, b: ExportModuleset): FieldChange[] {
  return [
    ...value("name", a.modset_name ?? "", b.modset_name ?? ""),
    ...items(
      "modules",
      a.modules,
      b.modules,
      (m) => m.modset_mod_name ?? "",
      (x, y) =>
        x.autofix === y.autofix
          ? null
          : `${y.modset_mod_name ?? ""} (autofix ${x.autofix ?? ""} → ${y.autofix ?? ""})`,
    ),
    ...list("rulesets", a.rulesets, b.rulesets),
    ...list("modulesets", a.modulesets, b.modulesets),
    ...list("publications", a.publications, b.publications),
    ...list("responsibles", a.responsibles, b.responsibles),
  ];
}

function filtersetFields(a: ExportFilterset, b: ExportFilterset): FieldChange[] {
  return [
    ...value("name", a.fset_name, b.fset_name),
    ...(JSON.stringify(a.filters) === JSON.stringify(b.filters)
      ? []
      : [{ field: "filters" as const }]),
  ];
}
