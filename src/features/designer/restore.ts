import type { components } from "@/lib/api/schema";
import {
  apply,
  describe,
  draftFromExports,
  refusal,
  type Draft,
  type LogLine,
  type ObjectKind,
  type Operation,
  type Refusal,
  type Stamp,
  type TeamRole,
} from "./model";

type Export = components["schemas"]["ComplianceExport"];

/**
 * Restoring a version of the compliance history goes through the sandbox: the
 * operations bringing the draft to the version become pending changes, to review
 * and commit as any other. Objects are matched by id, which a rename keeps, else
 * by name, for an object a restore created again under a new id; an object the
 * version holds and the draft does not is created again. Variables and modules
 * are matched by name.
 */

export interface RestorePlan {
  operations: Operation[];
  /** The operations the draft refuses, as the collector would: told, not applied. */
  skipped: { line: LogLine; refusal: Refusal }[];
}

const ROLES: readonly TeamRole[] = ["responsibles", "publications"];

/** The operations bringing `current` to the configuration of the version `target`. */
export function planRestore(current: Draft, target: Export, stamp: Stamp): RestorePlan {
  const goal = draftFromExports(target.rulesets, {
    modulesets: target.modulesets,
    rulesets: target.rulesets,
  });
  let draft = current;
  const operations: Operation[] = [];
  const skipped: RestorePlan["skipped"] = [];
  // Each operation is tried on the plan's own draft: the next ones see its effect,
  // and the ids of the objects it creates.
  const run = (operation: Operation) => {
    const refused = refusal(draft, operation);
    if (refused !== null) {
      skipped.push({ line: describe(draft, operation), refusal: refused });
      return undefined;
    }
    const result = apply(draft, operation, stamp);
    draft = result.draft;
    operations.push(operation);
    return result.created;
  };

  // The version's ids, as the draft knows them: the same for an object kept, a
  // new one for an object created again.
  const ids: Record<ObjectKind, Map<number, number>> = { ruleset: new Map(), moduleset: new Map() };
  const goalOf = (kind: ObjectKind) =>
    kind === "ruleset" ? Object.values(goal.rulesets) : Object.values(goal.modulesets);
  const draftOf = (kind: ObjectKind) =>
    kind === "ruleset" ? Object.values(draft.rulesets) : Object.values(draft.modulesets);

  for (const kind of ["moduleset", "ruleset"] as const) {
    // The version's objects in the draft: by id, else by name for an object the
    // version had under an id gone since, as one a restore created again; an
    // object of the draft goes to one of the version at most.
    const goalIds = new Set(goalOf(kind).map((g) => g.id));
    for (const object of goalOf(kind))
      if (draftOf(kind).some((o) => o.id === object.id)) ids[kind].set(object.id, object.id);
    const taken = new Set(ids[kind].values());
    for (const object of goalOf(kind)) {
      if (ids[kind].has(object.id)) continue;
      const same = draftOf(kind).find(
        (o) => o.name === object.name && !goalIds.has(o.id) && !taken.has(o.id),
      );
      if (same === undefined) continue;
      ids[kind].set(object.id, same.id);
      taken.add(same.id);
    }
    // What the version did not have goes first: its names are then free.
    for (const object of draftOf(kind))
      if (!taken.has(object.id)) run({ op: "delete", ref: { kind, id: object.id } });
    for (const object of goalOf(kind)) {
      const id = ids[kind].get(object.id);
      const kept = id === undefined ? undefined : draftOf(kind).find((o) => o.id === id);
      if (id !== undefined && kept !== undefined && kept.name !== object.name)
        run({ op: "rename", ref: { kind, id }, name: object.name });
    }
    for (const object of goalOf(kind)) {
      if (ids[kind].has(object.id)) continue;
      const created = run({ op: "create", kind, name: object.name });
      if (created !== undefined) ids[kind].set(object.id, created.id);
    }
  }

  // The content of each object, the relations aside.
  for (const goalRuleset of Object.values(goal.rulesets)) {
    const id = ids.ruleset.get(goalRuleset.id);
    if (id === undefined) continue;
    const now = () => draft.rulesets[id];
    if ((now()?.filterset ?? null) !== goalRuleset.filterset)
      run({ op: "setFilterset", id, filterset: goalRuleset.filterset });
    if (now()?.type !== goalRuleset.type) run({ op: "setType", id, type: goalRuleset.type });
    if (now()?.isPublic !== goalRuleset.isPublic)
      run({ op: "setPublic", id, isPublic: goalRuleset.isPublic });
    for (const variable of now()?.variables ?? [])
      if (!goalRuleset.variables.some((v) => v.name === variable.name))
        run({ op: "deleteVariable", rulesetId: id, variableId: variable.id });
    for (const variable of goalRuleset.variables) {
      const existing = now()?.variables.find((v) => v.name === variable.name);
      if (existing === undefined)
        run({
          op: "addVariable",
          rulesetId: id,
          name: variable.name,
          varClass: variable.varClass,
          value: variable.value,
        });
      else if (existing.value !== variable.value || existing.varClass !== variable.varClass)
        run({
          op: "updateVariable",
          rulesetId: id,
          variableId: existing.id,
          patch: { varClass: variable.varClass, value: variable.value },
        });
    }
    restoreTeams({ kind: "ruleset", id }, goalRuleset, () => now(), run);
  }
  for (const goalModuleset of Object.values(goal.modulesets)) {
    const id = ids.moduleset.get(goalModuleset.id);
    if (id === undefined) continue;
    const now = () => draft.modulesets[id];
    for (const module of now()?.modules ?? [])
      if (!goalModuleset.modules.some((m) => m.name === module.name))
        run({ op: "deleteModule", modulesetId: id, moduleId: module.id });
    for (const module of goalModuleset.modules) {
      let existing = now()?.modules.find((m) => m.name === module.name);
      if (existing === undefined) {
        run({ op: "addModule", modulesetId: id, name: module.name });
        existing = now()?.modules.find((m) => m.name === module.name);
      }
      if (existing !== undefined && existing.autofix !== module.autofix)
        run({ op: "setAutofix", modulesetId: id, moduleId: existing.id, autofix: module.autofix });
    }
    restoreTeams({ kind: "moduleset", id }, goalModuleset, () => now(), run);
  }

  // The relations last, every object being there: detached first, so that no
  // attachment closes a loop the version did not have.
  type Relation = {
    parent: { kind: ObjectKind; id: number };
    child: { kind: ObjectKind; id: number };
  };
  const wanted: Relation[] = [];
  const present: Relation[] = [];
  const mapped = (kind: ObjectKind, goalIds: number[]) =>
    goalIds.flatMap((g) => {
      const id = ids[kind].get(g);
      return id === undefined ? [] : [id];
    });
  for (const r of Object.values(goal.rulesets)) {
    const id = ids.ruleset.get(r.id);
    if (id === undefined) continue;
    for (const child of mapped("ruleset", r.rulesets))
      wanted.push({ parent: { kind: "ruleset", id }, child: { kind: "ruleset", id: child } });
  }
  for (const m of Object.values(goal.modulesets)) {
    const id = ids.moduleset.get(m.id);
    if (id === undefined) continue;
    for (const child of mapped("ruleset", m.rulesets))
      wanted.push({ parent: { kind: "moduleset", id }, child: { kind: "ruleset", id: child } });
    for (const child of mapped("moduleset", m.modulesets))
      wanted.push({ parent: { kind: "moduleset", id }, child: { kind: "moduleset", id: child } });
  }
  for (const r of Object.values(draft.rulesets))
    for (const child of r.rulesets)
      present.push({
        parent: { kind: "ruleset", id: r.id },
        child: { kind: "ruleset", id: child },
      });
  for (const m of Object.values(draft.modulesets)) {
    for (const child of m.rulesets)
      present.push({
        parent: { kind: "moduleset", id: m.id },
        child: { kind: "ruleset", id: child },
      });
    for (const child of m.modulesets)
      present.push({
        parent: { kind: "moduleset", id: m.id },
        child: { kind: "moduleset", id: child },
      });
  }
  const same = (a: Relation, b: Relation) =>
    a.parent.kind === b.parent.kind &&
    a.parent.id === b.parent.id &&
    a.child.kind === b.child.kind &&
    a.child.id === b.child.id;
  for (const relation of present)
    if (!wanted.some((w) => same(w, relation))) run({ op: "detach", ...relation });
  for (const relation of wanted)
    if (!present.some((p) => same(p, relation))) run({ op: "include", ...relation });

  return { operations, skipped };
}

/** The responsible and publication groups of an object, as the version had them. */
function restoreTeams(
  ref: { kind: ObjectKind; id: number },
  goal: { responsibles: string[]; publications: string[] },
  now: () => { responsibles: string[]; publications: string[] } | undefined,
  run: (operation: Operation) => unknown,
) {
  for (const role of ROLES) {
    for (const team of now()?.[role] ?? [])
      if (!goal[role].includes(team)) run({ op: "removeTeam", ref, role, team });
    for (const team of goal[role])
      if (!(now()?.[role] ?? []).includes(team)) run({ op: "addTeam", ref, role, team });
  }
}
