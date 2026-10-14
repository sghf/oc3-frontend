import type { QueryClient } from "@tanstack/react-query";
import type { ComboboxOption } from "@/components/ui/Combobox";
import type { ActionTarget, DataActionChoice, DataActionEntry } from "./ActionsMenu";
import { api } from "@/lib/api/client";
import { attachComp, detachComp, type CompAttachable } from "@/lib/api/object-compliance";
import { problemText } from "@/lib/api/problem";

/** The objects these data actions apply to: their kind, and their cache root. */
type ObjectKind = "node" | "service";

const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

/** Options from the rows of a list: a value and a label, both present. */
function options(data: unknown, value: string, label: string): ComboboxOption[] {
  return rows(data).flatMap((row) => {
    const v = row[value];
    const l = row[label];
    return (typeof v === "string" || typeof v === "number") && typeof l === "string"
      ? [{ value: String(v), label: l }]
      : [];
  });
}

/** Every tag, as the historical selector offers them (`generic_selector_tags`). */
const TAG_CHOICE: DataActionChoice = {
  queryKey: ["tags"],
  load: async () => {
    const { data, error } = await api.GET("/tags", {
      params: { query: { props: "tag_id,tag_name", orderby: "tag_name", limit: 0 } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    return options(data.data, "tag_id", "tag_name");
  },
};

/** Every moduleset the user sees (`generic_selector_modsets`). */
const MODULESET_CHOICE: DataActionChoice = {
  queryKey: ["modulesets"],
  load: async () => {
    const { data, error } = await api.GET("/compliance/modulesets", {
      params: { query: { props: "id,modset_name", orderby: "modset_name", limit: 0 } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    return options(data.data, "id", "modset_name");
  },
};

/**
 * The rulesets an object can have attached: the explicit and public ones, as the
 * historical selector (`generic_selector_rulesets`); the contextual ones apply by
 * their filterset, and the private ones only within a moduleset.
 */
const RULESET_CHOICE: DataActionChoice = {
  queryKey: ["rulesets", "explicit", "public"],
  load: async () => {
    const { data, error } = await api.GET("/compliance/rulesets", {
      params: {
        query: {
          props: "id,ruleset_name",
          orderby: "ruleset_name",
          limit: 0,
          filter: ["ruleset_type:in:explicit", "ruleset_public:in:T"],
        },
      },
    });
    if (error !== undefined) throw new Error(problemText(error));
    return options(data.data, "id", "ruleset_name");
  },
};

/**
 * The data actions the historical collector offered on a selection of nodes or of
 * services ("Data actions › On nodes", "On services"), apart from the deletion,
 * which each menu keeps: notifications on and off, attaching a tag, attaching and
 * detaching a moduleset or a ruleset. Each object is changed on its own, through
 * the routes the detail panels use, so that a refusal names its object.
 *
 * The notifications and the tags are offered to every user, as in the historical
 * collector: the API requires the responsibility of each object, which a selection
 * cannot tell beforehand. The modulesets and rulesets require CompExec, as the
 * Compliance tab of the panels. On services, the attachments are those of the
 * service itself, not of its encapsulated part.
 */
export function objectDataActions(kind: ObjectKind, queryClient: QueryClient): DataActionEntry[] {
  const refresh = (done: ActionTarget[]) => {
    if (done.length === 0) return;
    void queryClient.invalidateQueries({ queryKey: [`${kind}s`] });
    // The panel of each object: its properties, tags and compliance live under it.
    for (const target of done) void queryClient.invalidateQueries({ queryKey: [kind, target.id] });
  };

  const notifications = (on: boolean) => async (target: ActionTarget) => {
    const { error } =
      kind === "node"
        ? await api.POST("/nodes/{node_id}", {
            params: { path: { node_id: target.id } },
            body: { notifications: on },
          })
        : await api.POST("/services/{svc_id}", {
            params: { path: { svc_id: target.id } },
            body: { svc_notifications: on },
          });
    return error === undefined ? null : problemText(error);
  };

  const attachTag = async (target: ActionTarget, tagId: string | undefined) => {
    if (tagId === undefined) return null;
    const { error } =
      kind === "node"
        ? await api.POST("/tags/nodes", { body: { tag_id: tagId, node_id: target.id } })
        : await api.POST("/tags/services", { body: { tag_id: tagId, svc_id: target.id } });
    return error === undefined ? null : problemText(error);
  };

  const compliance =
    (what: CompAttachable, attach: boolean) =>
    async (target: ActionTarget, id: string | undefined) => {
      if (id === undefined) return null;
      const object = { kind, id: target.id };
      const { error } = attach
        ? await attachComp(object, what, id)
        : await detachComp(object, what, id);
      return error === undefined ? null : problemText(error);
    };

  return [
    {
      key: "notificationsOn",
      privileges: [],
      tone: "change",
      run: notifications(true),
      onDone: refresh,
    },
    {
      key: "notificationsOff",
      privileges: [],
      tone: "change",
      run: notifications(false),
      onDone: refresh,
    },
    {
      key: "tagAttach",
      privileges: [],
      tone: "change",
      separatorBefore: true,
      choice: TAG_CHOICE,
      run: attachTag,
      onDone: (done) => {
        refresh(done);
        void queryClient.invalidateQueries({ queryKey: ["tags"] });
      },
    },
    {
      key: "modulesetAttach",
      privileges: ["CompExec"],
      tone: "change",
      separatorBefore: true,
      choice: MODULESET_CHOICE,
      run: compliance("modulesets", true),
      onDone: refresh,
    },
    {
      key: "modulesetDetach",
      privileges: ["CompExec"],
      tone: "change",
      choice: MODULESET_CHOICE,
      run: compliance("modulesets", false),
      onDone: refresh,
    },
    {
      key: "rulesetAttach",
      privileges: ["CompExec"],
      tone: "change",
      choice: RULESET_CHOICE,
      run: compliance("rulesets", true),
      onDone: refresh,
    },
    {
      key: "rulesetDetach",
      privileges: ["CompExec"],
      tone: "change",
      choice: RULESET_CHOICE,
      run: compliance("rulesets", false),
      onDone: refresh,
    },
  ];
}
