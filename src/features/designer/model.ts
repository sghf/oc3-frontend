import type { components } from "@/lib/api/schema";

type ExportRuleset = components["schemas"]["CompExportRuleset"];
type ExportModuleset = components["schemas"]["CompExportModuleset"];

/**
 * The compliance designer works on a local draft: the rulesets and modulesets as
 * loaded, then changed by the operations below, never written back. Objects are
 * keyed by id; an object created in the draft gets a negative id.
 */

export type ObjectKind = "ruleset" | "moduleset";
export type TeamRole = "responsibles" | "publications";

export interface Variable {
  id: number;
  name: string;
  /** The form that describes the value, named by the variable class. */
  varClass: string;
  value: string;
  author: string;
  updated: string;
}

export interface Ruleset {
  kind: "ruleset";
  id: number;
  name: string;
  type: "explicit" | "contextual";
  isPublic: boolean;
  filterset: string | null;
  variables: Variable[];
  /** The rulesets it encapsulates, by id. */
  rulesets: number[];
  responsibles: string[];
  publications: string[];
}

export interface Module {
  id: number;
  name: string;
  autofix: boolean;
}

export interface Moduleset {
  kind: "moduleset";
  id: number;
  name: string;
  modules: Module[];
  /** The rulesets attached to it, by id. */
  rulesets: number[];
  /** The modulesets it includes, by id. */
  modulesets: number[];
  responsibles: string[];
  publications: string[];
}

export interface Draft {
  rulesets: Record<number, Ruleset>;
  modulesets: Record<number, Moduleset>;
  /** The next id to give an object created in the draft, counting down from -1. */
  nextId: number;
}

export interface ObjectRef {
  kind: ObjectKind;
  id: number;
}

/** The draft built from the ruleset and moduleset exports of apicollector. */
export function draftFromExports(
  rulesetExport: ExportRuleset[],
  modulesetExport: { modulesets: ExportModuleset[]; rulesets: ExportRuleset[] },
): Draft {
  let nextId = -1;
  const rulesets: Record<number, Ruleset> = {};
  const rulesetIds = new Map<string, number>();
  const exported = [...rulesetExport, ...modulesetExport.rulesets];
  for (const r of exported) {
    if (r.id === undefined || r.ruleset_name === undefined || rulesets[r.id] !== undefined)
      continue;
    rulesetIds.set(r.ruleset_name, r.id);
    rulesets[r.id] = {
      kind: "ruleset",
      id: r.id,
      name: r.ruleset_name,
      type: r.ruleset_type === "contextual" ? "contextual" : "explicit",
      isPublic: r.ruleset_public !== "F",
      filterset: r.fset_name ?? null,
      variables: (r.variables ?? []).map((v) => ({
        id: v.id ?? nextId--,
        name: v.var_name ?? "",
        varClass: v.var_class ?? "raw",
        value: v.var_value ?? "",
        author: v.var_author ?? "",
        updated: v.var_updated ?? "",
      })),
      rulesets: [],
      responsibles: [...(r.responsibles ?? [])].sort(),
      publications: [...(r.publications ?? [])].sort(),
    };
  }
  for (const r of exported) {
    const own = r.id === undefined ? undefined : rulesets[r.id];
    if (own === undefined || own.rulesets.length > 0) continue;
    own.rulesets = idsOf(r.rulesets, rulesetIds);
  }
  const modulesets: Record<number, Moduleset> = {};
  const modulesetIds = new Map<string, number>();
  for (const m of modulesetExport.modulesets) {
    if (m.id === undefined || m.modset_name === undefined) continue;
    modulesetIds.set(m.modset_name, m.id);
  }
  for (const m of modulesetExport.modulesets) {
    if (m.id === undefined || m.modset_name === undefined) continue;
    modulesets[m.id] = {
      kind: "moduleset",
      id: m.id,
      name: m.modset_name,
      // The export gives no module id: the draft numbers them itself.
      modules: (m.modules ?? []).map((mod) => ({
        id: nextId--,
        name: mod.modset_mod_name ?? "",
        autofix: mod.autofix === "T",
      })),
      rulesets: idsOf(m.rulesets, rulesetIds),
      modulesets: idsOf(m.modulesets, modulesetIds),
      responsibles: [...(m.responsibles ?? [])].sort(),
      publications: [...(m.publications ?? [])].sort(),
    };
  }
  return { rulesets, modulesets, nextId };
}

function idsOf(names: string[] | undefined, ids: Map<string, number>): number[] {
  return (names ?? []).flatMap((name) => {
    const id = ids.get(name);
    return id === undefined ? [] : [id];
  });
}

export function objectOf(draft: Draft, ref: ObjectRef): Ruleset | Moduleset | undefined {
  return ref.kind === "ruleset" ? draft.rulesets[ref.id] : draft.modulesets[ref.id];
}

/** Every ruleset a ruleset encapsulates, directly or not. */
export function descendantRulesets(
  draft: Draft,
  id: number,
  seen = new Set<number>(),
): Set<number> {
  for (const child of draft.rulesets[id]?.rulesets ?? []) {
    if (seen.has(child)) continue;
    seen.add(child);
    descendantRulesets(draft, child, seen);
  }
  return seen;
}

/** Every moduleset a moduleset includes, directly or not. */
export function descendantModulesets(
  draft: Draft,
  id: number,
  seen = new Set<number>(),
): Set<number> {
  for (const child of draft.modulesets[id]?.modulesets ?? []) {
    if (seen.has(child)) continue;
    seen.add(child);
    descendantModulesets(draft, child, seen);
  }
  return seen;
}

/** Where an object is used in the draft: the rulesets and modulesets referencing it. */
export function parentsOf(
  draft: Draft,
  ref: ObjectRef,
): { rulesets: Ruleset[]; modulesets: Moduleset[] } {
  if (ref.kind === "ruleset") {
    return {
      rulesets: Object.values(draft.rulesets).filter((r) => r.rulesets.includes(ref.id)),
      modulesets: Object.values(draft.modulesets).filter((m) => m.rulesets.includes(ref.id)),
    };
  }
  return {
    rulesets: [],
    modulesets: Object.values(draft.modulesets).filter((m) => m.modulesets.includes(ref.id)),
  };
}

/** The variables a ruleset inherits from the rulesets it encapsulates, with their origin. */
export function inheritedVariables(
  draft: Draft,
  id: number,
): { from: Ruleset; chain: string[]; variable: Variable }[] {
  const out: { from: Ruleset; chain: string[]; variable: Variable }[] = [];
  const walk = (rid: number, chain: string[], seen: Set<number>) => {
    for (const child of draft.rulesets[rid]?.rulesets ?? []) {
      const rset = draft.rulesets[child];
      if (rset === undefined || seen.has(child)) continue;
      const next = [...chain, rset.name];
      for (const variable of rset.variables) out.push({ from: rset, chain: next, variable });
      walk(child, next, new Set([...seen, child]));
    }
  };
  walk(id, [draft.rulesets[id]?.name ?? ""], new Set([id]));
  return out;
}

export type Operation =
  | { op: "create"; kind: ObjectKind; name: string }
  | { op: "rename"; ref: ObjectRef; name: string }
  | { op: "clone"; ref: ObjectRef }
  | { op: "delete"; ref: ObjectRef }
  | { op: "setType"; id: number; type: "explicit" | "contextual" }
  | { op: "setFilterset"; id: number; filterset: string | null }
  | { op: "setPublic"; id: number; isPublic: boolean }
  | { op: "addVariable"; rulesetId: number; name: string; varClass: string; value: string }
  | {
      op: "updateVariable";
      rulesetId: number;
      variableId: number;
      patch: Partial<Pick<Variable, "name" | "varClass" | "value">>;
    }
  | { op: "deleteVariable"; rulesetId: number; variableId: number }
  | { op: "copyVariable"; fromId: number; variableId: number; toId: number; move: boolean }
  | { op: "include"; parent: ObjectRef; child: ObjectRef }
  | { op: "detach"; parent: ObjectRef; child: ObjectRef }
  | { op: "addModule"; modulesetId: number; name: string }
  | { op: "renameModule"; modulesetId: number; moduleId: number; name: string }
  | { op: "setAutofix"; modulesetId: number; moduleId: number; autofix: boolean }
  | { op: "deleteModule"; modulesetId: number; moduleId: number }
  | { op: "addTeam"; ref: ObjectRef; role: TeamRole; team: string }
  | { op: "removeTeam"; ref: ObjectRef; role: TeamRole; team: string }
  | { op: "moveTeam"; ref: ObjectRef; from: TeamRole; to: TeamRole; team: string };

/** Why an operation is refused, as a translation key with its values; null when valid. */
export interface Refusal {
  key: string;
  values?: Record<string, string>;
}

function nameTaken(draft: Draft, kind: ObjectKind, name: string, except?: number): boolean {
  const all = kind === "ruleset" ? Object.values(draft.rulesets) : Object.values(draft.modulesets);
  return all.some((o) => o.name === name && o.id !== except);
}

/** Checks an operation against the draft, as the collector would refuse it. */
export function refusal(draft: Draft, operation: Operation): Refusal | null {
  switch (operation.op) {
    case "create":
    case "rename": {
      const name = operation.name.trim();
      if (name === "") return { key: "designer.refused.emptyName" };
      const kind = operation.op === "create" ? operation.kind : operation.ref.kind;
      const except = operation.op === "rename" ? operation.ref.id : undefined;
      if (nameTaken(draft, kind, name, except))
        return { key: "designer.refused.nameTaken", values: { name } };
      return null;
    }
    case "addVariable": {
      const name = operation.name.trim();
      if (name === "") return { key: "designer.refused.emptyName" };
      const rset = draft.rulesets[operation.rulesetId];
      if (rset?.variables.some((v) => v.name === name))
        return { key: "designer.refused.variableTaken", values: { name, ruleset: rset.name } };
      return null;
    }
    case "updateVariable": {
      const name = operation.patch.name?.trim();
      if (name === undefined) return null;
      if (name === "") return { key: "designer.refused.emptyName" };
      const rset = draft.rulesets[operation.rulesetId];
      if (rset?.variables.some((v) => v.name === name && v.id !== operation.variableId))
        return { key: "designer.refused.variableTaken", values: { name, ruleset: rset.name } };
      return null;
    }
    case "copyVariable": {
      const from = draft.rulesets[operation.fromId];
      const to = draft.rulesets[operation.toId];
      const variable = from?.variables.find((v) => v.id === operation.variableId);
      if (from === undefined || to === undefined || variable === undefined)
        return { key: "designer.refused.missing" };
      if (from.id === to.id) return { key: "designer.refused.sameRuleset" };
      if (to.variables.some((v) => v.name === variable.name))
        return {
          key: "designer.refused.variableTaken",
          values: { name: variable.name, ruleset: to.name },
        };
      return null;
    }
    case "include": {
      const { parent, child } = operation;
      const parentObj = objectOf(draft, parent);
      const childObj = objectOf(draft, child);
      if (parentObj === undefined || childObj === undefined)
        return { key: "designer.refused.missing" };
      if (parent.kind === "ruleset" && child.kind === "moduleset")
        return { key: "designer.refused.modulesetInRuleset" };
      if (parent.kind === child.kind && parent.id === child.id)
        return { key: "designer.refused.self", values: { name: childObj.name } };
      const list =
        child.kind === "ruleset"
          ? parentObj.rulesets
          : parentObj.kind === "moduleset"
            ? parentObj.modulesets
            : [];
      if (list.includes(child.id))
        return {
          key: "designer.refused.already",
          values: { child: childObj.name, parent: parentObj.name },
        };
      const loops =
        parent.kind === "ruleset"
          ? descendantRulesets(draft, child.id).has(parent.id)
          : child.kind === "moduleset" && descendantModulesets(draft, child.id).has(parent.id);
      if (loops)
        return {
          key: "designer.refused.loop",
          values: { child: childObj.name, parent: parentObj.name },
        };
      return null;
    }
    case "setFilterset": {
      const rset = draft.rulesets[operation.id];
      if (rset === undefined) return { key: "designer.refused.missing" };
      if (operation.filterset !== null && rset.filterset === operation.filterset)
        return {
          key: "designer.refused.filtersetAlready",
          values: { filterset: operation.filterset, ruleset: rset.name },
        };
      return null;
    }
    case "addModule": {
      const name = operation.name.trim();
      if (name === "") return { key: "designer.refused.emptyName" };
      const modset = draft.modulesets[operation.modulesetId];
      if (modset?.modules.some((m) => m.name === name))
        return { key: "designer.refused.moduleTaken", values: { name, moduleset: modset.name } };
      return null;
    }
    case "renameModule": {
      const name = operation.name.trim();
      if (name === "") return { key: "designer.refused.emptyName" };
      const modset = draft.modulesets[operation.modulesetId];
      if (modset?.modules.some((m) => m.name === name && m.id !== operation.moduleId))
        return { key: "designer.refused.moduleTaken", values: { name, moduleset: modset.name } };
      return null;
    }
    case "addTeam": {
      const obj = objectOf(draft, operation.ref);
      if (obj?.[operation.role].includes(operation.team))
        return {
          key: `designer.refused.teamAlready.${operation.role}`,
          values: { team: operation.team, name: obj.name },
        };
      if (operation.role === "responsibles" && operation.team === "Everybody")
        return { key: "designer.refused.everybodyResponsible" };
      return null;
    }
    case "moveTeam": {
      const obj = objectOf(draft, operation.ref);
      if (obj?.[operation.to].includes(operation.team))
        return {
          key: `designer.refused.teamAlready.${operation.to}`,
          values: { team: operation.team, name: obj.name },
        };
      if (operation.to === "responsibles" && operation.team === "Everybody")
        return { key: "designer.refused.everybodyResponsible" };
      return null;
    }
    default:
      return null;
  }
}

/** The author and date stamped on a variable changed in the draft. */
export interface Stamp {
  author: string;
  now: string;
}

function withRuleset(draft: Draft, id: number, change: (r: Ruleset) => Ruleset): Draft {
  const rset = draft.rulesets[id];
  if (rset === undefined) return draft;
  return { ...draft, rulesets: { ...draft.rulesets, [id]: change(rset) } };
}

function withModuleset(draft: Draft, id: number, change: (m: Moduleset) => Moduleset): Draft {
  const modset = draft.modulesets[id];
  if (modset === undefined) return draft;
  return { ...draft, modulesets: { ...draft.modulesets, [id]: change(modset) } };
}

function withObject(
  draft: Draft,
  ref: ObjectRef,
  change: <T extends Ruleset | Moduleset>(o: T) => T,
): Draft {
  return ref.kind === "ruleset"
    ? withRuleset(draft, ref.id, change)
    : withModuleset(draft, ref.id, change);
}

/** A name not yet taken, "<name>_clone" as the collector clones, numbered if needed. */
export function cloneName(draft: Draft, kind: ObjectKind, name: string): string {
  let candidate = `${name}_clone`;
  for (let i = 2; nameTaken(draft, kind, candidate); i++) candidate = `${name}_clone${String(i)}`;
  return candidate;
}

/** The draft after a valid operation; the id of the object it created, if any. */
export function apply(
  draft: Draft,
  operation: Operation,
  stamp: Stamp,
): { draft: Draft; created?: ObjectRef } {
  switch (operation.op) {
    case "create": {
      const id = draft.nextId;
      const name = operation.name.trim();
      const next = { ...draft, nextId: id - 1 };
      if (operation.kind === "ruleset") {
        next.rulesets = {
          ...draft.rulesets,
          [id]: {
            kind: "ruleset",
            id,
            name,
            type: "explicit",
            isPublic: true,
            filterset: null,
            variables: [],
            rulesets: [],
            responsibles: [],
            publications: [],
          },
        };
      } else {
        next.modulesets = {
          ...draft.modulesets,
          [id]: {
            kind: "moduleset",
            id,
            name,
            modules: [],
            rulesets: [],
            modulesets: [],
            responsibles: [],
            publications: [],
          },
        };
      }
      return { draft: next, created: { kind: operation.kind, id } };
    }
    case "rename":
      return {
        draft: withObject(draft, operation.ref, (o) => ({ ...o, name: operation.name.trim() })),
      };
    case "clone": {
      const source = objectOf(draft, operation.ref);
      if (source === undefined) return { draft };
      let nextId = draft.nextId;
      const id = nextId--;
      const name = cloneName(draft, source.kind, source.name);
      if (source.kind === "ruleset") {
        const copy: Ruleset = {
          ...source,
          id,
          name,
          variables: source.variables.map((v) => ({ ...v, id: nextId-- })),
        };
        return {
          draft: { ...draft, nextId, rulesets: { ...draft.rulesets, [id]: copy } },
          created: { kind: "ruleset", id },
        };
      }
      const copy: Moduleset = {
        ...source,
        id,
        name,
        modules: source.modules.map((m) => ({ ...m, id: nextId-- })),
      };
      return {
        draft: { ...draft, nextId, modulesets: { ...draft.modulesets, [id]: copy } },
        created: { kind: "moduleset", id },
      };
    }
    case "delete": {
      const { ref } = operation;
      const rulesets = { ...draft.rulesets };
      const modulesets = { ...draft.modulesets };
      if (ref.kind === "ruleset") {
        delete rulesets[ref.id];
        for (const r of Object.values(rulesets))
          if (r.rulesets.includes(ref.id))
            rulesets[r.id] = { ...r, rulesets: r.rulesets.filter((c) => c !== ref.id) };
        for (const m of Object.values(modulesets))
          if (m.rulesets.includes(ref.id))
            modulesets[m.id] = { ...m, rulesets: m.rulesets.filter((c) => c !== ref.id) };
      } else {
        delete modulesets[ref.id];
        for (const m of Object.values(modulesets))
          if (m.modulesets.includes(ref.id))
            modulesets[m.id] = { ...m, modulesets: m.modulesets.filter((c) => c !== ref.id) };
      }
      return { draft: { ...draft, rulesets, modulesets } };
    }
    case "setType":
      return { draft: withRuleset(draft, operation.id, (r) => ({ ...r, type: operation.type })) };
    case "setFilterset":
      return {
        draft: withRuleset(draft, operation.id, (r) => ({
          ...r,
          filterset: operation.filterset,
          // A filterset is what makes a ruleset contextual, as attaching one does.
          type: operation.filterset === null ? r.type : "contextual",
        })),
      };
    case "setPublic":
      return {
        draft: withRuleset(draft, operation.id, (r) => ({ ...r, isPublic: operation.isPublic })),
      };
    case "addVariable": {
      const id = draft.nextId;
      const next = withRuleset(draft, operation.rulesetId, (r) => ({
        ...r,
        variables: [
          ...r.variables,
          {
            id,
            name: operation.name.trim(),
            varClass: operation.varClass,
            value: operation.value,
            author: stamp.author,
            updated: stamp.now,
          },
        ],
      }));
      return { draft: { ...next, nextId: id - 1 } };
    }
    case "updateVariable":
      return {
        draft: withRuleset(draft, operation.rulesetId, (r) => ({
          ...r,
          variables: r.variables.map((v) =>
            v.id === operation.variableId
              ? {
                  ...v,
                  ...operation.patch,
                  name: operation.patch.name?.trim() ?? v.name,
                  author: stamp.author,
                  updated: stamp.now,
                }
              : v,
          ),
        })),
      };
    case "deleteVariable":
      return {
        draft: withRuleset(draft, operation.rulesetId, (r) => ({
          ...r,
          variables: r.variables.filter((v) => v.id !== operation.variableId),
        })),
      };
    case "copyVariable": {
      const variable = draft.rulesets[operation.fromId]?.variables.find(
        (v) => v.id === operation.variableId,
      );
      if (variable === undefined) return { draft };
      const id = draft.nextId;
      let next = withRuleset(draft, operation.toId, (r) => ({
        ...r,
        variables: [...r.variables, { ...variable, id, author: stamp.author, updated: stamp.now }],
      }));
      if (operation.move)
        next = withRuleset(next, operation.fromId, (r) => ({
          ...r,
          variables: r.variables.filter((v) => v.id !== operation.variableId),
        }));
      return { draft: { ...next, nextId: id - 1 } };
    }
    case "include":
    case "detach": {
      const { parent, child } = operation;
      const change = (list: number[]) =>
        operation.op === "include" ? [...list, child.id] : list.filter((c) => c !== child.id);
      if (parent.kind === "ruleset")
        return {
          draft: withRuleset(draft, parent.id, (r) => ({ ...r, rulesets: change(r.rulesets) })),
        };
      return {
        draft: withModuleset(draft, parent.id, (m) =>
          child.kind === "ruleset"
            ? { ...m, rulesets: change(m.rulesets) }
            : { ...m, modulesets: change(m.modulesets) },
        ),
      };
    }
    case "addModule": {
      const id = draft.nextId;
      const next = withModuleset(draft, operation.modulesetId, (m) => ({
        ...m,
        modules: [...m.modules, { id, name: operation.name.trim(), autofix: false }],
      }));
      return { draft: { ...next, nextId: id - 1 } };
    }
    case "renameModule":
    case "setAutofix":
      return {
        draft: withModuleset(draft, operation.modulesetId, (m) => ({
          ...m,
          modules: m.modules.map((mod) =>
            mod.id !== operation.moduleId
              ? mod
              : operation.op === "renameModule"
                ? { ...mod, name: operation.name.trim() }
                : { ...mod, autofix: operation.autofix },
          ),
        })),
      };
    case "deleteModule":
      return {
        draft: withModuleset(draft, operation.modulesetId, (m) => ({
          ...m,
          modules: m.modules.filter((mod) => mod.id !== operation.moduleId),
        })),
      };
    case "addTeam":
      return {
        draft: withObject(draft, operation.ref, (o) => ({
          ...o,
          [operation.role]: [...o[operation.role], operation.team].sort(),
        })),
      };
    case "removeTeam":
      return {
        draft: withObject(draft, operation.ref, (o) => ({
          ...o,
          [operation.role]: o[operation.role].filter((t) => t !== operation.team),
        })),
      };
    case "moveTeam":
      return {
        draft: withObject(draft, operation.ref, (o) => ({
          ...o,
          [operation.from]: o[operation.from].filter((t) => t !== operation.team),
          [operation.to]: [...o[operation.to], operation.team].sort(),
        })),
      };
  }
}

/** One line of the change log: what an operation did, in words. */
export interface LogLine {
  key: string;
  values: Record<string, string>;
}

/** Describes an operation against the draft it applies to. */
export function describe(draft: Draft, operation: Operation): LogLine {
  const nameOf = (ref: ObjectRef) => objectOf(draft, ref)?.name ?? "?";
  const rset = (id: number) => draft.rulesets[id]?.name ?? "?";
  const modset = (id: number) => draft.modulesets[id]?.name ?? "?";
  const variable = (rid: number, vid: number) =>
    draft.rulesets[rid]?.variables.find((v) => v.id === vid)?.name ?? "?";
  const module = (mid: number, id: number) =>
    draft.modulesets[mid]?.modules.find((m) => m.id === id)?.name ?? "?";
  switch (operation.op) {
    case "create":
      return {
        key: `designer.log.create.${operation.kind}`,
        values: { name: operation.name.trim() },
      };
    case "rename":
      return {
        key: "designer.log.rename",
        values: { from: nameOf(operation.ref), to: operation.name.trim() },
      };
    case "clone":
      return { key: "designer.log.clone", values: { name: nameOf(operation.ref) } };
    case "delete":
      return {
        key: `designer.log.delete.${operation.ref.kind}`,
        values: { name: nameOf(operation.ref) },
      };
    case "setType":
      return { key: `designer.log.type.${operation.type}`, values: { name: rset(operation.id) } };
    case "setFilterset":
      return operation.filterset === null
        ? { key: "designer.log.filtersetRemoved", values: { name: rset(operation.id) } }
        : {
            key: "designer.log.filterset",
            values: { name: rset(operation.id), filterset: operation.filterset },
          };
    case "setPublic":
      return {
        key: operation.isPublic ? "designer.log.public" : "designer.log.private",
        values: { name: rset(operation.id) },
      };
    case "addVariable":
      return {
        key: "designer.log.addVariable",
        values: { name: operation.name.trim(), ruleset: rset(operation.rulesetId) },
      };
    case "updateVariable":
      return {
        key: "designer.log.updateVariable",
        values: {
          name: variable(operation.rulesetId, operation.variableId),
          ruleset: rset(operation.rulesetId),
        },
      };
    case "deleteVariable":
      return {
        key: "designer.log.deleteVariable",
        values: {
          name: variable(operation.rulesetId, operation.variableId),
          ruleset: rset(operation.rulesetId),
        },
      };
    case "copyVariable":
      return {
        key: operation.move ? "designer.log.moveVariable" : "designer.log.copyVariable",
        values: {
          name: variable(operation.fromId, operation.variableId),
          from: rset(operation.fromId),
          to: rset(operation.toId),
        },
      };
    case "include":
    case "detach":
      return {
        key: `designer.log.${operation.op}`,
        values: { child: nameOf(operation.child), parent: nameOf(operation.parent) },
      };
    case "addModule":
      return {
        key: "designer.log.addModule",
        values: { name: operation.name.trim(), moduleset: modset(operation.modulesetId) },
      };
    case "renameModule":
      return {
        key: "designer.log.rename",
        values: {
          from: module(operation.modulesetId, operation.moduleId),
          to: operation.name.trim(),
        },
      };
    case "setAutofix":
      return {
        key: operation.autofix ? "designer.log.autofixOn" : "designer.log.autofixOff",
        values: { name: module(operation.modulesetId, operation.moduleId) },
      };
    case "deleteModule":
      return {
        key: "designer.log.deleteModule",
        values: {
          name: module(operation.modulesetId, operation.moduleId),
          moduleset: modset(operation.modulesetId),
        },
      };
    case "addTeam":
    case "removeTeam":
      return {
        key: `designer.log.${operation.op}.${operation.role}`,
        values: { team: operation.team, name: nameOf(operation.ref) },
      };
    case "moveTeam":
      return {
        key: `designer.log.moveTeam.${operation.to}`,
        values: { team: operation.team, name: nameOf(operation.ref) },
      };
  }
}

/** Whether an object differs from its loaded version: created, or changed since. */
export function isModified(original: Draft, draft: Draft, ref: ObjectRef): boolean {
  if (ref.id < 0) return true;
  const before = objectOf(original, ref);
  const after = objectOf(draft, ref);
  if (before === undefined || after === undefined) return true;
  if (after.kind === "moduleset" && before.kind === "moduleset") {
    // Module ids are the draft's own: compare the modules by content.
    const strip = (m: Moduleset) => ({
      ...m,
      modules: m.modules.map(({ name, autofix }) => ({ name, autofix })),
    });
    return JSON.stringify(strip(before)) !== JSON.stringify(strip(after));
  }
  return JSON.stringify(before) !== JSON.stringify(after);
}
