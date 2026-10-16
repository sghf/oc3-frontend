import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { TransientNotice } from "@/components/ui/TransientNotice";
import type { SysreportEntry } from "./queries";

type SysreportPurge = components["schemas"]["SysreportPurge"];

/** A purge asked from this tab: its id, and the file it removes. */
export interface PurgeTarget {
  id: string;
  path: string;
}

/** How often the progress of a purge is read while it is queued or running. */
const POLL_MS = 2000;

/**
 * Removing a file from the sysreport history for good, after its consequences
 * are read and the path typed again: of this node, or of every node that
 * reported it. The purge is queued for the scheduler; `onQueued` hands its id to
 * the tab, which follows it.
 */
export function SysreportPurgeForm({
  nodeId,
  entry,
  onQueued,
  onCancel,
}: {
  nodeId: string;
  entry: SysreportEntry;
  onQueued: (target: PurgeTarget) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [allNodes, setAllNodes] = useState(false);
  const [typed, setTyped] = useState("");
  const confirmed = typed === entry.path;

  const queue = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/nodes/{node_id}/sysreport/purge", {
        params: { path: { node_id: nodeId } },
        body: { files: [{ kind: entry.kind, path: entry.path }], all_nodes: allNodes },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.data.id;
    },
    onSuccess: (purgeId) => {
      onQueued({ id: purgeId, path: entry.path });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmed) queue.mutate();
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-2 rounded-(--radius-panel) border border-state-down p-3"
    >
      <h4 id={`${id}-title`} className="font-semibold">
        {t("nodes.sysreport.purge.title")}
      </h4>
      <ul className="list-disc pl-5 text-ink">
        <li>{t("nodes.sysreport.purge.effects.every")}</li>
        <li>{t("nodes.sysreport.purge.effects.ids")}</li>
        <li>{t("nodes.sysreport.purge.effects.outside")}</li>
        <li>{t("nodes.sysreport.purge.effects.again")}</li>
      </ul>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium">{t("nodes.sysreport.purge.scope")}</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${id}-scope`}
            checked={!allNodes}
            onChange={() => {
              setAllNodes(false);
            }}
          />
          {t("nodes.sysreport.purge.thisNode")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${id}-scope`}
            checked={allNodes}
            onChange={() => {
              setAllNodes(true);
            }}
          />
          {t("nodes.sysreport.purge.allNodes")}
        </label>
      </fieldset>
      <label htmlFor={`${id}-confirm`} className="font-medium">
        {t("nodes.sysreport.purge.confirm")} <code className="font-normal">{entry.path}</code>
      </label>
      <input
        id={`${id}-confirm`}
        value={typed}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
        className="h-8 rounded-(--radius-control) border border-line bg-surface px-2 font-mono"
      />
      {queue.isError && (
        <p role="alert" className="text-state-down">
          ■ {queue.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!confirmed || queue.isPending}
          className="h-8 rounded-(--radius-control) bg-state-down px-3 font-medium text-surface-raised disabled:opacity-60"
        >
          {queue.isPending ? t("nodes.sysreport.purge.queuing") : t("nodes.sysreport.purge.submit")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-(--radius-control) border border-line px-3 hover:bg-surface-sunken"
        >
          {t("detail.cancel")}
        </button>
      </div>
    </form>
  );
}

/**
 * The progress of a purge asked from the tab, read until it ends: a line while
 * it is queued or running, then a notice of what it removed. Once it ends, the
 * sysreport of the node is read again, the file and the revisions it alone held
 * gone.
 */
export function SysreportPurgeTracker({
  nodeId,
  target,
  onDismiss,
}: {
  nodeId: string;
  target: PurgeTarget;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["sysreport-purge", target.id],
    queryFn: async (): Promise<SysreportPurge> => {
      const { data, error } = await api.GET("/sysreport/purges/{purge_id}", {
        params: { path: { purge_id: target.id } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      if (data.data.state === "done" || data.data.state === "failed")
        await queryClient.invalidateQueries({ queryKey: ["node", nodeId, "sysreport"] });
      return data.data;
    },
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "done" || state === "failed" ? false : POLL_MS;
    },
  });

  if (status.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {t("nodes.sysreport.purge.statusError", { message: status.error.message })}
      </p>
    );
  const purge = status.data;
  if (purge === undefined || purge.state === "queued" || purge.state === "running")
    return (
      <p role="status" className="text-ink-muted">
        <span aria-hidden="true">… </span>
        {t(
          purge?.state === "running"
            ? "nodes.sysreport.purge.running"
            : "nodes.sysreport.purge.queued",
          { path: target.path },
        )}
      </p>
    );

  const sum = (key: "rewritten" | "dropped" | "removed" | "kept") =>
    purge.nodes.reduce((total, node) => total + node[key], 0);
  const failed = purge.nodes.filter((node) => node.error !== undefined);
  const text =
    purge.state === "failed"
      ? t("nodes.sysreport.purge.failed", {
          path: target.path,
          error: failed[0]?.error ?? purge.error ?? "",
        })
      : purge.nodes.length === 0
        ? t("nodes.sysreport.purge.nothing", { path: target.path })
        : [
            t("nodes.sysreport.purge.done", {
              path: target.path,
              count: purge.nodes.length,
              rewritten: sum("rewritten"),
              dropped: sum("dropped"),
              removed: sum("removed"),
            }),
            sum("kept") > 0 ? t("nodes.sysreport.purge.kept", { count: sum("kept") }) : "",
          ]
            .filter((part) => part !== "")
            .join(" ");
  return (
    <TransientNotice
      id={purge.id}
      tone={purge.state === "failed" ? "error" : purge.nodes.length === 0 ? "info" : "success"}
      text={text}
      dismissLabel={t("nodes.sysreport.purge.dismiss")}
      onDismiss={onDismiss}
    />
  );
}
