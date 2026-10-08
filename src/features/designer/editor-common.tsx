import { useQuery } from "@tanstack/react-query";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { HistoryIcon, TrashIcon } from "@/components/ui/icons";
import { useDesigner } from "./designer-context";
import { isModified, objectOf, parentsOf, type Draft, type ObjectRef } from "./model";
import { InlineName, ObjectLink, Section } from "./parts";
import { BUTTON, OpenHistoryContext } from "./ui";

/**
 * The top of an editor: the object's name, renamed in place, whether the draft
 * changed it, and the actions on the whole object.
 */
export function EditorHeader({
  refTo,
  onSelect,
  onDeleted,
}: {
  refTo: ObjectRef;
  onSelect: (ref: ObjectRef) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const openHistory = useContext(OpenHistoryContext);
  const [json, setJson] = useState(false);
  const obj = objectOf(designer.draft, refTo);
  const usage = useRemoteUsage(refTo);
  if (obj === undefined) return null;
  const parents = parentsOf(designer.draft, refTo);
  const uses =
    parents.rulesets.length +
    parents.modulesets.length +
    (usage.data?.nodes.length ?? 0) +
    (usage.data?.services.length ?? 0);
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ObjectIcon kind={refTo.kind} className="h-5 w-5" />
        <h2 className="text-title font-semibold">
          <InlineName
            value={obj.name}
            label={obj.name}
            onCommit={(name) => {
              const { refused } = designer.run({ op: "rename", ref: refTo, name });
              return refused;
            }}
          />
        </h2>
        <span className="text-ink-muted">{t(`designer.kind.${refTo.kind}`)}</span>
        {isModified(designer.original, designer.draft, refTo) && (
          <span className="rounded-full border border-state-warn px-2 text-state-warn">
            ● {refTo.id < 0 ? t("designer.created") : t("designer.modified")}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Only an object the collector holds has a history: one created in the
              sandbox has none yet. */}
          {refTo.id > 0 && (
            <button
              type="button"
              className={BUTTON}
              title={t("designer.historyPanel.objectHint", { name: obj.name })}
              onClick={() => {
                openHistory({ kind: refTo.kind, id: refTo.id, name: obj.name });
              }}
            >
              <HistoryIcon className="h-3.5 w-3.5" />
              {t("designer.historyPanel.open")}
            </button>
          )}
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              const created = designer.runAndTell({ op: "clone", ref: refTo });
              if (created !== undefined) onSelect(created);
            }}
          >
            {t("designer.clone")}
          </button>
          <button
            type="button"
            aria-pressed={json}
            className={`${BUTTON} aria-pressed:bg-accent-soft aria-pressed:text-ink`}
            onClick={() => {
              setJson(!json);
            }}
          >
            {t("designer.export")}
          </button>
          <ConfirmButton
            label={t("designer.delete")}
            icon={<TrashIcon className="h-3.5 w-3.5" />}
            question={
              uses === 0
                ? t("designer.deleteQuestion", { name: obj.name })
                : t("designer.deleteQuestionUsed", { name: obj.name, count: uses })
            }
            confirmLabel={t("designer.delete")}
            cancelLabel={t("designer.cancel")}
            pendingLabel={t("designer.delete")}
            onConfirm={() => {
              designer.runAndTell({ op: "delete", ref: refTo });
              onDeleted();
            }}
          />
        </div>
      </div>
      {json && (
        <pre className="max-h-80 overflow-auto rounded-(--radius-control) border border-line bg-surface-sunken p-2 font-mono text-data">
          {JSON.stringify(exportOf(designer.draft, refTo), null, 2)}
        </pre>
      )}
    </header>
  );
}

/** An object of the draft in the shape of the collector export, relations by name. */
function exportOf(draft: Draft, ref: ObjectRef): unknown {
  const rsetName = (id: number) => draft.rulesets[id]?.name;
  if (ref.kind === "ruleset") {
    const r = draft.rulesets[ref.id];
    if (r === undefined) return null;
    return {
      ruleset_name: r.name,
      ruleset_type: r.type,
      ruleset_public: r.isPublic ? "T" : "F",
      fset_name: r.filterset,
      variables: r.variables.map((v) => ({
        var_name: v.name,
        var_class: v.varClass,
        var_value: v.value,
        var_author: v.author,
        var_updated: v.updated,
      })),
      rulesets: r.rulesets.map(rsetName),
      publications: r.publications,
      responsibles: r.responsibles,
    };
  }
  const m = draft.modulesets[ref.id];
  if (m === undefined) return null;
  return {
    modset_name: m.name,
    modules: m.modules.map((mod) => ({
      modset_mod_name: mod.name,
      autofix: mod.autofix ? "T" : "F",
    })),
    rulesets: m.rulesets.map(rsetName),
    modulesets: m.modulesets.map((id) => draft.modulesets[id]?.name),
    publications: m.publications,
    responsibles: m.responsibles,
  };
}

interface RemoteUsage {
  nodes: { id: string; name: string }[];
  services: { id: string; name: string }[];
}

/**
 * The nodes and services an object is attached to, as stored: the draft does not
 * change them, and an object created in the draft has none.
 */
function useRemoteUsage(ref: ObjectRef) {
  return useQuery({
    queryKey: ["designer", "usage", ref.kind, ref.id],
    enabled: ref.id > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<RemoteUsage> => {
      if (ref.kind === "ruleset") {
        const { data, error } = await api.GET("/compliance/rulesets/{rset_id}/usage", {
          params: { path: { rset_id: String(ref.id) } },
        });
        if (error !== undefined) throw new Error(problemText(error));
        return {
          nodes: (data.data?.nodes ?? []).map((n) => ({
            id: n.node_id ?? "",
            name: n.nodename ?? "",
          })),
          services: (data.data?.services ?? []).map((s) => ({
            id: s.svc_id ?? "",
            name: s.svcname ?? "",
          })),
        };
      }
      const [nodes, services] = await Promise.all([
        api.GET("/compliance/modulesets/{modset_id}/nodes", {
          params: {
            path: { modset_id: String(ref.id) },
            query: { props: "node_id,nodename", limit: 0 },
          },
        }),
        api.GET("/compliance/modulesets/{modset_id}/services", {
          params: {
            path: { modset_id: String(ref.id) },
            query: { props: "svc_id,svcname", limit: 0 },
          },
        }),
      ]);
      if (nodes.error !== undefined) throw new Error(problemText(nodes.error));
      if (services.error !== undefined) throw new Error(problemText(services.error));
      const rows = (d: unknown): Record<string, unknown>[] =>
        Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
      return {
        nodes: rows(nodes.data.data).map((n) => ({
          id: String(n.node_id ?? ""),
          name: String(n.nodename ?? ""),
        })),
        services: rows(services.data.data).map((s) => ({
          id: String(s.svc_id ?? ""),
          name: String(s.svcname ?? ""),
        })),
      };
    },
  });
}

/** Where the object is used: by the draft's objects, and by the nodes and services as stored. */
export function UsedBy({ refTo }: { refTo: ObjectRef }) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const usage = useRemoteUsage(refTo);
  const parents = parentsOf(designer.draft, refTo);
  const nothing =
    parents.rulesets.length === 0 &&
    parents.modulesets.length === 0 &&
    (usage.data?.nodes.length ?? 0) === 0 &&
    (usage.data?.services.length ?? 0) === 0;
  return (
    <Section title={t("designer.usedBy")}>
      {nothing && !usage.isPending && <p className="text-ink-muted">{t("designer.unused")}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {parents.modulesets.length > 0 && (
          <>
            <dt className="text-ink-muted">{t("designer.modulesets")}</dt>
            <dd className="flex flex-wrap gap-1">
              {parents.modulesets.map((m) => (
                <ObjectLink key={m.id} refTo={{ kind: "moduleset", id: m.id }} />
              ))}
            </dd>
          </>
        )}
        {parents.rulesets.length > 0 && (
          <>
            <dt className="text-ink-muted">{t("designer.rulesets")}</dt>
            <dd className="flex flex-wrap gap-1">
              {parents.rulesets.map((r) => (
                <ObjectLink key={r.id} refTo={{ kind: "ruleset", id: r.id }} />
              ))}
            </dd>
          </>
        )}
        {(usage.data?.nodes.length ?? 0) > 0 && (
          <>
            <dt className="text-ink-muted">{t("designer.nodes")}</dt>
            <dd className="flex flex-wrap gap-1">
              {usage.data?.nodes.map((n) => (
                <CrossLink key={n.id} kind="node" id={n.id}>
                  {n.name}
                </CrossLink>
              ))}
            </dd>
          </>
        )}
        {(usage.data?.services.length ?? 0) > 0 && (
          <>
            <dt className="text-ink-muted">{t("designer.services")}</dt>
            <dd className="flex flex-wrap gap-1">
              {usage.data?.services.map((s) => (
                <CrossLink key={s.id} kind="service" id={s.id}>
                  {s.name}
                </CrossLink>
              ))}
            </dd>
          </>
        )}
      </dl>
      {usage.isError && <p className="text-state-down">■ {usage.error.message}</p>}
    </Section>
  );
}
