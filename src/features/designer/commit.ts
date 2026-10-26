import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import type { components } from "@/lib/api/schema";
import { cloneName, type Draft, type ObjectRef, type Operation, type TeamRole } from "./model";

type DesignerOperation = components["schemas"]["ComplianceDesignerOperation"];

/**
 * Committing the sandbox: the operations of its history are sent at once to the
 * collector (POST /compliance/designer/commits), which applies them in their
 * order, all or nothing.
 *
 * An object is named as it was just before the operation, in the draft that
 * operation started from: by its id when it came from the collector (the draft
 * keeps the collector's ids, which a rename does not change); by "tmp:<its draft
 * id>" when the sandbox created it, the collector mapping that reference to the
 * object it creates. Variables the sandbox created go by name, modules always
 * do: the export gives them no id.
 */

/** How the API names an object of the draft. */
function objectRef(ref: ObjectRef): string {
  return ref.id > 0 ? String(ref.id) : `tmp:${String(ref.id)}`;
}

function rulesetRef(id: number): string {
  return objectRef({ kind: "ruleset", id });
}

function variableRef(before: Draft, rulesetId: number, variableId: number): string {
  if (variableId > 0) return String(variableId);
  const variable = before.rulesets[rulesetId]?.variables.find((v) => v.id === variableId);
  if (variable === undefined) throw new Error(`unknown variable ${String(variableId)}`);
  return variable.name;
}

function moduleRef(before: Draft, modulesetId: number, moduleId: number): string {
  const module = before.modulesets[modulesetId]?.modules.find((m) => m.id === moduleId);
  if (module === undefined) throw new Error(`unknown module ${String(moduleId)}`);
  return module.name;
}

const ROLES: Record<TeamRole, DesignerOperation["role"]> = {
  publications: "publication",
  responsibles: "responsible",
};

/** An operation of the draft `before`, as the API takes it. */
export function toDesignerOperation(before: Draft, operation: Operation): DesignerOperation {
  switch (operation.op) {
    case "create":
      return {
        op: "create",
        kind: operation.kind,
        name: operation.name.trim(),
        // The id the draft gives the object it creates: its next one.
        as: objectRef({ kind: operation.kind, id: before.nextId }),
      };
    case "rename":
      return {
        op: "rename",
        kind: operation.ref.kind,
        ref: objectRef(operation.ref),
        name: operation.name.trim(),
      };
    case "clone": {
      const source =
        operation.ref.kind === "ruleset"
          ? before.rulesets[operation.ref.id]
          : before.modulesets[operation.ref.id];
      return {
        op: "clone",
        kind: operation.ref.kind,
        ref: objectRef(operation.ref),
        as: objectRef({ kind: operation.ref.kind, id: before.nextId }),
        // The name the draft gave the clone, the one the next operations know.
        name: cloneName(before, operation.ref.kind, source?.name ?? ""),
      };
    }
    case "delete":
      return { op: "delete", kind: operation.ref.kind, ref: objectRef(operation.ref) };
    case "setType":
      return {
        op: "set_type",
        kind: "ruleset",
        ref: rulesetRef(operation.id),
        ruleset_type: operation.type,
      };
    case "setPublic":
      return {
        op: "set_public",
        kind: "ruleset",
        ref: rulesetRef(operation.id),
        ruleset_public: operation.isPublic,
      };
    case "setFilterset":
      return {
        op: "set_filterset",
        kind: "ruleset",
        ref: rulesetRef(operation.id),
        ...(operation.filterset === null ? {} : { filterset: operation.filterset }),
      };
    case "addVariable":
      return {
        op: "add_variable",
        kind: "ruleset",
        ref: rulesetRef(operation.rulesetId),
        var_name: operation.name.trim(),
        var_class: operation.varClass,
        var_value: operation.value,
      };
    case "updateVariable": {
      const { patch } = operation;
      return {
        op: "update_variable",
        kind: "ruleset",
        ref: rulesetRef(operation.rulesetId),
        variable: variableRef(before, operation.rulesetId, operation.variableId),
        ...(patch.name === undefined ? {} : { var_name: patch.name.trim() }),
        ...(patch.varClass === undefined ? {} : { var_class: patch.varClass }),
        ...(patch.value === undefined ? {} : { var_value: patch.value }),
      };
    }
    case "deleteVariable":
      return {
        op: "delete_variable",
        kind: "ruleset",
        ref: rulesetRef(operation.rulesetId),
        variable: variableRef(before, operation.rulesetId, operation.variableId),
      };
    case "copyVariable":
      return {
        op: "copy_variable",
        kind: "ruleset",
        ref: rulesetRef(operation.fromId),
        variable: variableRef(before, operation.fromId, operation.variableId),
        dst: rulesetRef(operation.toId),
        move: operation.move,
      };
    case "include":
    case "detach":
      return {
        op: operation.op,
        kind: operation.parent.kind,
        ref: objectRef(operation.parent),
        child_kind: operation.child.kind,
        child: objectRef(operation.child),
      };
    case "addModule":
      return {
        op: "add_module",
        kind: "moduleset",
        ref: objectRef({ kind: "moduleset", id: operation.modulesetId }),
        name: operation.name.trim(),
      };
    case "renameModule":
    case "setAutofix":
    case "deleteModule": {
      const target = {
        kind: "moduleset" as const,
        ref: objectRef({ kind: "moduleset", id: operation.modulesetId }),
        module: moduleRef(before, operation.modulesetId, operation.moduleId),
      };
      if (operation.op === "renameModule")
        return { op: "rename_module", ...target, name: operation.name.trim() };
      if (operation.op === "setAutofix")
        return { op: "set_autofix", ...target, autofix: operation.autofix };
      return { op: "delete_module", ...target };
    }
    case "addTeam":
    case "removeTeam":
      return {
        op: operation.op === "addTeam" ? "add_team" : "remove_team",
        kind: operation.ref.kind,
        ref: objectRef(operation.ref),
        role: ROLES[operation.role],
        team: operation.team,
      };
    case "moveTeam":
      return {
        op: "move_team",
        kind: operation.ref.kind,
        ref: objectRef(operation.ref),
        role: ROLES[operation.from],
        to_role: ROLES[operation.to],
        team: operation.team,
      };
  }
}

/**
 * The outcome of a commit, all or nothing: the version of the compliance export
 * recording the changes once saved; otherwise the refusal, with the index of the
 * operation refused when the collector names one.
 */
export type CommitResult =
  | { saved: true; version: RecordedVersion }
  | { saved: false; failure: { index?: number; message: string } };

/**
 * Sends the operations of the sandbox history, with the messages of the versions
 * of the compliance history recorded around them: the changes made elsewhere
 * before, those of the commit after.
 */
export async function commitAll(
  history: readonly { before: Draft; operation: Operation }[],
  message: string,
  baselineMessage: string,
): Promise<CommitResult> {
  try {
    const operations = history.map((entry) => toDesignerOperation(entry.before, entry.operation));
    const { data, error } = await api.POST("/compliance/designer/commits", {
      body: { message, baseline_message: baselineMessage, operations },
    });
    if (error !== undefined)
      return {
        saved: false,
        failure: { index: "index" in error ? error.index : undefined, message: problemText(error) },
      };
    return {
      saved: true,
      version:
        data.version === undefined
          ? { error: data.version_error ?? "" }
          : { commit: data.version.commit, changed: data.version.changed },
    };
  } catch (failure) {
    return {
      saved: false,
      failure: { message: failure instanceof Error ? failure.message : String(failure) },
    };
  }
}

/** The version of the compliance export a commit recorded, or why none was. */
export type RecordedVersion = { commit: string; changed: boolean } | { error: string };

/**
 * Records the compliance export, as the collector now holds it, as a new version
 * of the compliance history (a git commit on the collector), with `message`. A
 * failure is returned rather than thrown: the changes are saved all the same.
 */
export async function recordVersion(
  message: string,
  source: "designer" | "elsewhere",
): Promise<RecordedVersion> {
  try {
    const { data, error } = await api.POST("/compliance/history", { body: { message, source } });
    if (error !== undefined) return { error: problemText(error) };
    return { commit: data.commit, changed: data.changed };
  } catch (failure) {
    return { error: failure instanceof Error ? failure.message : String(failure) };
  }
}
