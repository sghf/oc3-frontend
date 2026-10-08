import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import {
  cloneName,
  type Draft,
  type ObjectKind,
  type ObjectRef,
  type Operation,
  type TeamRole,
} from "./model";

/**
 * Committing the sandbox: the operations of its history are replayed against the
 * collector, in the order they were made, each with the API calls doing the same.
 *
 * An object is named on the server as it was just before the operation, in the
 * draft that operation started from: by its id when it came from the collector
 * (the draft keeps the collector's ids, which a rename does not change), by its
 * name when the sandbox created it, since the collector gave it an id of its own.
 * The API takes a name wherever it takes an id. Modules always go by name: the
 * export gives them none.
 */

/**
 * The names the collector gave to the objects the sandbox cloned, when they differ
 * from the draft's: the draft picks a free "<name>_clone…", the collector its own.
 */
export type Aliases = Map<string, string>;

function aliasKey(kind: ObjectKind, name: string): string {
  return `${kind}:${name}`;
}

/** How the API names an object of the draft `before`. */
function objectRef(before: Draft, ref: ObjectRef, aliases: Aliases): string {
  if (ref.id > 0) return String(ref.id);
  const object = ref.kind === "ruleset" ? before.rulesets[ref.id] : before.modulesets[ref.id];
  if (object === undefined) throw new Error(`unknown ${ref.kind} ${String(ref.id)}`);
  return aliases.get(aliasKey(ref.kind, object.name)) ?? object.name;
}

function rulesetRef(before: Draft, id: number, aliases: Aliases): string {
  return objectRef(before, { kind: "ruleset", id }, aliases);
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

/** The error of a call, as the collector words it. */
function check(response: { error?: unknown; response: Response }): void {
  if (response.error !== undefined) throw new Error(problemText(response.error));
  if (!response.response.ok) throw new Error(response.response.statusText);
}

/** The name the collector gave a clone, from its answer: "clone done. new … name X". */
function cloneNameOf(data: unknown): string | undefined {
  const info =
    typeof data === "object" && data !== null && "info" in data
      ? (data as { info: unknown }).info
      : undefined;
  const text = Array.isArray(info) ? info.join(" ") : typeof info === "string" ? info : "";
  return /new (?:ruleset|moduleset) name (.+)$/.exec(text.trim())?.[1];
}

async function setTeam(ref: ObjectRef, object: string, role: TeamRole, team: string, on: boolean) {
  if (ref.kind === "ruleset") {
    const params = { path: { rset_id: object, group_id: team } };
    if (role === "responsibles")
      check(
        on
          ? await api.POST("/compliance/rulesets/{rset_id}/responsibles/{group_id}", { params })
          : await api.DELETE("/compliance/rulesets/{rset_id}/responsibles/{group_id}", { params }),
      );
    else
      check(
        on
          ? await api.POST("/compliance/rulesets/{rset_id}/publications/{group_id}", { params })
          : await api.DELETE("/compliance/rulesets/{rset_id}/publications/{group_id}", { params }),
      );
    return;
  }
  const params = { path: { modset_id: object, group_id: team } };
  if (role === "responsibles")
    check(
      on
        ? await api.POST("/compliance/modulesets/{modset_id}/responsibles/{group_id}", { params })
        : await api.DELETE("/compliance/modulesets/{modset_id}/responsibles/{group_id}", {
            params,
          }),
    );
  else
    check(
      on
        ? await api.POST("/compliance/modulesets/{modset_id}/publications/{group_id}", { params })
        : await api.DELETE("/compliance/modulesets/{modset_id}/publications/{group_id}", {
            params,
          }),
    );
}

/**
 * Applies one operation to the collector, the draft `before` being the one it
 * started from; throws the collector's refusal.
 */
export async function commitOperation(
  before: Draft,
  operation: Operation,
  aliases: Aliases,
): Promise<void> {
  switch (operation.op) {
    case "create": {
      const name = operation.name.trim();
      // The draft's defaults, which are the collector's too, said explicitly.
      if (operation.kind === "ruleset")
        check(
          await api.POST("/compliance/rulesets", {
            body: { ruleset_name: name, ruleset_type: "explicit", ruleset_public: true },
          }),
        );
      else check(await api.POST("/compliance/modulesets", { body: { modset_name: name } }));
      return;
    }
    case "rename": {
      const object = objectRef(before, operation.ref, aliases);
      const name = operation.name.trim();
      if (operation.ref.kind === "ruleset")
        check(
          await api.POST("/compliance/rulesets/{rset_id}", {
            params: { path: { rset_id: object } },
            body: { ruleset_name: name },
          }),
        );
      else
        check(
          await api.POST("/compliance/modulesets/{modset_id}", {
            params: { path: { modset_id: object } },
            body: { modset_name: name },
          }),
        );
      return;
    }
    case "clone": {
      const object = objectRef(before, operation.ref, aliases);
      const response =
        operation.ref.kind === "ruleset"
          ? await api.PUT("/compliance/rulesets/{rset_id}", {
              params: { path: { rset_id: object } },
              body: { action: "clone" },
            })
          : await api.PUT("/compliance/modulesets/{modset_id}", {
              params: { path: { modset_id: object } },
              body: { action: "clone" },
            });
      check(response);
      // The name the draft gave the clone: the one the next operations know it by.
      const source =
        operation.ref.kind === "ruleset"
          ? before.rulesets[operation.ref.id]
          : before.modulesets[operation.ref.id];
      const draftName = cloneName(before, operation.ref.kind, source?.name ?? "");
      const serverName = cloneNameOf(response.data);
      if (serverName !== undefined && serverName !== draftName)
        aliases.set(aliasKey(operation.ref.kind, draftName), serverName);
      return;
    }
    case "delete": {
      const object = objectRef(before, operation.ref, aliases);
      if (operation.ref.kind === "ruleset")
        check(
          await api.DELETE("/compliance/rulesets/{rset_id}", {
            params: { path: { rset_id: object } },
          }),
        );
      else
        check(
          await api.DELETE("/compliance/modulesets/{modset_id}", {
            params: { path: { modset_id: object } },
          }),
        );
      return;
    }
    case "setType":
      check(
        await api.POST("/compliance/rulesets/{rset_id}", {
          params: { path: { rset_id: rulesetRef(before, operation.id, aliases) } },
          body: { ruleset_type: operation.type },
        }),
      );
      return;
    case "setPublic":
      check(
        await api.POST("/compliance/rulesets/{rset_id}", {
          params: { path: { rset_id: rulesetRef(before, operation.id, aliases) } },
          body: { ruleset_public: operation.isPublic },
        }),
      );
      return;
    case "setFilterset": {
      const ruleset = rulesetRef(before, operation.id, aliases);
      const previous = before.rulesets[operation.id];
      if (operation.filterset === null) {
        if (previous?.filterset === null || previous?.filterset === undefined) return;
        check(
          await api.DELETE("/compliance/rulesets/{rset_id}/filtersets/{fset_id}", {
            params: { path: { rset_id: ruleset, fset_id: previous.filterset } },
          }),
        );
        return;
      }
      // A filterset goes to a contextual ruleset: the draft makes it one at once.
      if (previous?.type !== "contextual")
        check(
          await api.POST("/compliance/rulesets/{rset_id}", {
            params: { path: { rset_id: ruleset } },
            body: { ruleset_type: "contextual" },
          }),
        );
      check(
        await api.POST("/compliance/rulesets/{rset_id}/filtersets/{fset_id}", {
          params: { path: { rset_id: ruleset, fset_id: operation.filterset } },
        }),
      );
      return;
    }
    case "addVariable":
      check(
        await api.POST("/compliance/rulesets/{rset_id}/variables", {
          params: { path: { rset_id: rulesetRef(before, operation.rulesetId, aliases) } },
          body: {
            var_name: operation.name.trim(),
            var_class: operation.varClass,
            var_value: operation.value,
          },
        }),
      );
      return;
    case "updateVariable": {
      const { patch } = operation;
      check(
        await api.POST("/compliance/rulesets/{rset_id}/variables/{var_id}", {
          params: {
            path: {
              rset_id: rulesetRef(before, operation.rulesetId, aliases),
              var_id: variableRef(before, operation.rulesetId, operation.variableId),
            },
          },
          body: {
            ...(patch.name === undefined ? {} : { var_name: patch.name.trim() }),
            ...(patch.varClass === undefined ? {} : { var_class: patch.varClass }),
            ...(patch.value === undefined ? {} : { var_value: patch.value }),
          },
        }),
      );
      return;
    }
    case "deleteVariable":
      check(
        await api.DELETE("/compliance/rulesets/{rset_id}/variables/{var_id}", {
          params: {
            path: {
              rset_id: rulesetRef(before, operation.rulesetId, aliases),
              var_id: variableRef(before, operation.rulesetId, operation.variableId),
            },
          },
        }),
      );
      return;
    case "copyVariable":
      check(
        await api.PUT("/compliance/rulesets/{rset_id}/variables/{var_id}", {
          params: {
            path: {
              rset_id: rulesetRef(before, operation.fromId, aliases),
              var_id: variableRef(before, operation.fromId, operation.variableId),
            },
          },
          body: {
            action: operation.move ? "move" : "copy",
            dst_ruleset: rulesetRef(before, operation.toId, aliases),
          },
        }),
      );
      return;
    case "include":
    case "detach": {
      const on = operation.op === "include";
      const parent = objectRef(before, operation.parent, aliases);
      const child = objectRef(before, operation.child, aliases);
      if (operation.parent.kind === "ruleset") {
        const params = { path: { rset_id: parent, child_rset_id: child } };
        check(
          on
            ? await api.POST("/compliance/rulesets/{rset_id}/rulesets/{child_rset_id}", { params })
            : await api.DELETE("/compliance/rulesets/{rset_id}/rulesets/{child_rset_id}", {
                params,
              }),
        );
      } else if (operation.child.kind === "ruleset") {
        const params = { path: { modset_id: parent, rset_id: child } };
        check(
          on
            ? await api.POST("/compliance/modulesets/{modset_id}/rulesets/{rset_id}", { params })
            : await api.DELETE("/compliance/modulesets/{modset_id}/rulesets/{rset_id}", { params }),
        );
      } else {
        const params = { path: { modset_id: parent, child_modset_id: child } };
        check(
          on
            ? await api.POST("/compliance/modulesets/{modset_id}/modulesets/{child_modset_id}", {
                params,
              })
            : await api.DELETE("/compliance/modulesets/{modset_id}/modulesets/{child_modset_id}", {
                params,
              }),
        );
      }
      return;
    }
    case "addModule":
      check(
        await api.POST("/compliance/modulesets/{modset_id}/modules", {
          params: {
            path: {
              modset_id: objectRef(
                before,
                { kind: "moduleset", id: operation.modulesetId },
                aliases,
              ),
            },
          },
          body: { modset_mod_name: operation.name.trim(), autofix: false },
        }),
      );
      return;
    case "renameModule":
    case "setAutofix":
      check(
        await api.POST("/compliance/modulesets/{modset_id}/modules/{mod_id}", {
          params: {
            path: {
              modset_id: objectRef(
                before,
                { kind: "moduleset", id: operation.modulesetId },
                aliases,
              ),
              mod_id: moduleRef(before, operation.modulesetId, operation.moduleId),
            },
          },
          body:
            operation.op === "renameModule"
              ? { modset_mod_name: operation.name.trim() }
              : { autofix: operation.autofix },
        }),
      );
      return;
    case "deleteModule":
      check(
        await api.DELETE("/compliance/modulesets/{modset_id}/modules/{mod_id}", {
          params: {
            path: {
              modset_id: objectRef(
                before,
                { kind: "moduleset", id: operation.modulesetId },
                aliases,
              ),
              mod_id: moduleRef(before, operation.modulesetId, operation.moduleId),
            },
          },
        }),
      );
      return;
    case "addTeam":
    case "removeTeam":
      await setTeam(
        operation.ref,
        objectRef(before, operation.ref, aliases),
        operation.role,
        operation.team,
        operation.op === "addTeam",
      );
      return;
    case "moveTeam": {
      const object = objectRef(before, operation.ref, aliases);
      await setTeam(operation.ref, object, operation.from, operation.team, false);
      await setTeam(operation.ref, object, operation.to, operation.team, true);
      return;
    }
  }
}

/**
 * The outcome of a commit: how many operations were saved, the refusal that
 * stopped it, and the version of the compliance export recording what was saved.
 */
export interface CommitResult {
  saved: number;
  total: number;
  failure?: { index: number; message: string };
  version?: RecordedVersion;
}

/**
 * Replays the operations in order, stopping at the first the collector refuses:
 * those before it are saved, the refused one and the next ones are not.
 */
export async function commitAll(
  history: readonly { before: Draft; operation: Operation }[],
  onProgress: (done: number) => void,
): Promise<CommitResult> {
  const aliases: Aliases = new Map();
  for (const [index, entry] of history.entries()) {
    try {
      await commitOperation(entry.before, entry.operation, aliases);
    } catch (error) {
      return {
        saved: index,
        total: history.length,
        failure: { index, message: error instanceof Error ? error.message : String(error) },
      };
    }
    onProgress(index + 1);
  }
  return { saved: history.length, total: history.length };
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
