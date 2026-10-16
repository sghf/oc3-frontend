import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { useAmIResponsible } from "@/lib/api/am-i-responsible";
import {
  attachComp,
  detachComp,
  useCompAttached,
  useCompCandidates,
  useCompStatus,
  type CompAttachable,
  type CompObject,
  type CompTarget,
} from "@/lib/api/object-compliance";
import { parseCollectorDate } from "@/lib/format";
import { ChangeOutcomeLine, EditorPart, ObjectChips } from "@/components/opensvc/CompEditorParts";
import { useChanges, type RunChange } from "@/components/opensvc/comp-changes";
import { RunLog, RunStatus } from "@/components/opensvc/ComplianceRun";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { Combobox } from "@/components/ui/Combobox";
import { RelativeTime } from "@/components/ui/RelativeTime";

type StatusRow = components["schemas"]["ComplianceStatusRow"];

/**
 * Days after which a check no longer tells the state of its module, as the
 * Compliance Status view counts it.
 */
const OBSOLETE_DAYS = 7;

function isObsolete(runDate: string | undefined, now: number): boolean {
  const parsed = parseCollectorDate(runDate);
  return parsed !== null && now - parsed.getTime() > OBSOLETE_DAYS * 24 * 60 * 60 * 1000;
}

/** The first line of a run's output, the whole of it unfolded below. */
function RunOutput({ value }: { value: string | undefined }) {
  if (value === undefined || value.trim() === "") return null;
  const first = value.split("\n").find((line) => line.trim() !== "") ?? "";
  return (
    <details className="min-w-0">
      <summary className="cursor-pointer truncate font-mono text-data">{first}</summary>
      <div className="mt-1 max-h-64 overflow-auto rounded-(--radius-control) bg-surface-sunken p-2 text-data">
        <RunLog value={value} />
      </div>
    </details>
  );
}

/**
 * Whether the user may attach and detach the modulesets and rulesets of a node or
 * a service: a Manager or a CompExec, responsible for the object, as the historical
 * collector offered it. The collector checks the responsibility again on each
 * change.
 */
function useCanEditCompliance(target: CompTarget, readOnly: boolean) {
  const privileges = useEffectivePrivileges();
  const privileged =
    !readOnly && privileges.data !== undefined && hasPrivilege(privileges.data, ["CompExec"]);
  // The same question as the tags of the object, from the same cache.
  const responsible = useAmIResponsible(target.kind, target.id, privileged);
  return privileged && responsible.data === true;
}

/**
 * The modulesets, or the rulesets, attached to the object, as chips opening their
 * record; for whoever may change them, a cross detaching one and a field attaching
 * one of the candidates the collector offers.
 */
function AttachedPart({
  target,
  what,
  title,
  editable,
  busy,
  change,
}: {
  target: CompTarget;
  what: CompAttachable;
  title: string;
  editable: boolean;
  busy: boolean;
  change: RunChange;
}) {
  const { t } = useTranslation();
  const attached = useCompAttached(target, what);
  const candidates = useCompCandidates(target, what, editable);
  const byName = new Map((attached.data ?? []).map((object) => [object.name, object]));

  function attach(object: CompObject) {
    void change(t(`objectCompliance.${what}.attached`, { name: object.name }), () =>
      attachComp(target, what, object.id),
    );
  }

  function detach(object: CompObject) {
    void change(t(`objectCompliance.${what}.detached`, { name: object.name }), () =>
      detachComp(target, what, object.id),
    );
  }

  return (
    <EditorPart
      title={title}
      count={attached.data?.length}
      actions={
        editable && (
          <Combobox
            options={(candidates.data ?? [])
              .filter((object) => !byName.has(object.name))
              .map((object) => ({ value: object.id, label: object.name }))}
            value=""
            onChange={(id) => {
              const picked = candidates.data?.find((object) => object.id === id);
              if (picked !== undefined && !busy) attach(picked);
            }}
            label={t(`objectCompliance.${what}.attach`)}
            placeholder={t(`objectCompliance.${what}.attach`)}
            emptyText={candidates.isPending ? t("detail.loading") : t("compEditor.noMatch")}
            className="w-56"
          />
        )
      }
    >
      {attached.isError ? (
        <p role="alert" className="text-state-down">
          ■ {attached.error.message}
        </p>
      ) : attached.isPending ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : (
        <ObjectChips
          kind={what === "modulesets" ? "moduleset" : "ruleset"}
          names={(attached.data ?? []).map((object) => object.name)}
          linkId={(name) => byName.get(name)?.id}
          empty={t(`objectCompliance.${what}.none`)}
          removeLabel={(name) => t(`objectCompliance.${what}.detach`, { name })}
          onRemove={
            editable && !busy
              ? (name) => {
                  const object = byName.get(name);
                  if (object !== undefined) detach(object);
                }
              : undefined
          }
        />
      )}
    </EditorPart>
  );
}

/**
 * The last check of each module, grouped by the other side of the runs: on a node,
 * the node's own runs then each service it hosts; on a service, each node it runs
 * on; nothing to group by for an instance.
 */
function StatusTable({
  rows,
  groupBy,
  isPending,
  errorMessage,
  locale,
}: {
  rows: StatusRow[];
  groupBy: "service" | "node" | "none";
  isPending: boolean;
  errorMessage: string | null;
  locale: string;
}) {
  const { t } = useTranslation();
  const now = Date.now();
  const groups =
    groupBy === "none"
      ? [{ key: "all", label: "", rows }]
      : (() => {
          const idOf = (row: StatusRow) => (groupBy === "service" ? row.svc_id : row.node_id) ?? "";
          const nameOf = (row: StatusRow) =>
            (groupBy === "service" ? row["services.svcname"] : row["nodes.nodename"]) ?? idOf(row);
          const others = [
            ...new Map(
              rows.filter((row) => idOf(row) !== "").map((row) => [idOf(row), nameOf(row)]),
            ).entries(),
          ].sort((a, b) => a[1].localeCompare(b[1]));
          return [
            // On a node, the runs of no service are the node's own.
            {
              key: "",
              label: t("objectCompliance.status.nodeRuns"),
              rows: rows.filter((row) => idOf(row) === ""),
            },
            ...others.map(([id, name]) => ({
              key: id,
              label: name,
              rows: rows.filter((row) => idOf(row) === id),
            })),
          ].filter((group) => group.rows.length > 0);
        })();

  const columns: RelatedColumn<StatusRow>[] = [
    {
      key: "module",
      label: t("complianceStatus.fields.run_module"),
      render: (row) => <span className="whitespace-nowrap">{row.run_module}</span>,
    },
    {
      key: "status",
      label: t("complianceStatus.fields.run_status"),
      render: (row) => (
        <RunStatus value={row.run_status} outdated={isObsolete(row.run_date, now)} />
      ),
    },
    {
      key: "date",
      label: t("complianceStatus.fields.run_date"),
      render: (row) =>
        row.run_date === undefined ? null : <RelativeTime value={row.run_date} locale={locale} />,
    },
    {
      key: "log",
      label: t("complianceStatus.fields.run_log"),
      grow: true,
      render: (row) => <RunOutput value={row.run_log} />,
    },
  ];

  return (
    <section>
      <h3 className="mb-1 flex items-center gap-2 font-semibold">
        {t("objectCompliance.status.title")}
        {!isPending && <span className="font-normal text-ink-muted">({rows.length})</span>}
      </h3>
      <RelatedTable
        columns={columns}
        groups={groups}
        rowKey={(row) => String(row.id)}
        isPending={isPending}
        errorMessage={errorMessage}
        empty={t("objectCompliance.status.none")}
        caption={t("objectCompliance.status.title")}
      />
    </section>
  );
}

/**
 * The compliance of a node or a service, as the historical tabs: the modulesets
 * and rulesets attached to it, which whoever may change them attaches and detaches
 * here, then the last check of each module.
 *
 * - `encap` adds, for a service, the modulesets and rulesets of its encapsulated
 *   nodes, its containers;
 * - `statusFilter` keeps only some runs, those of one node for an instance;
 * - `readOnlyHint`, when given, shows the attachments without editing them, and
 *   says where they are changed.
 */
export function ObjectCompliance({
  target,
  locale,
  groupStatusBy,
  encap = false,
  statusFilter,
  readOnlyHint,
}: {
  target: CompTarget;
  locale: string;
  groupStatusBy: "service" | "node" | "none";
  encap?: boolean;
  statusFilter?: (row: StatusRow) => boolean;
  readOnlyHint?: ReactNode;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useCompStatus(target);
  const editable = useCanEditCompliance(target, readOnlyHint !== undefined);
  const { outcome, busy, change, dismiss } = useChanges(() =>
    queryClient.invalidateQueries({ queryKey: [target.kind, target.id, "compliance"] }),
  );
  const slave: CompTarget | undefined =
    target.kind === "service" ? { kind: "service", id: target.id, slave: true } : undefined;
  // The containers' attachments show for an encapsulated service, and wherever
  // some exist, so that none is ever hidden.
  const slaveModulesets = useCompAttached(slave, "modulesets");
  const slaveRulesets = useCompAttached(slave, "rulesets");
  const showEncap =
    slave !== undefined &&
    (encap || (slaveModulesets.data?.length ?? 0) > 0 || (slaveRulesets.data?.length ?? 0) > 0);
  const rows = (status.data ?? []).filter(statusFilter ?? (() => true));

  return (
    <div className="flex flex-col gap-3">
      <ChangeOutcomeLine outcome={outcome} onDismiss={dismiss} />
      {readOnlyHint !== undefined && <p className="text-ink-muted">{readOnlyHint}</p>}
      <AttachedPart
        target={target}
        what="modulesets"
        title={t("objectCompliance.modulesets.title")}
        editable={editable}
        busy={busy}
        change={change}
      />
      <AttachedPart
        target={target}
        what="rulesets"
        title={t("objectCompliance.rulesets.title")}
        editable={editable}
        busy={busy}
        change={change}
      />
      {showEncap && (
        <>
          <AttachedPart
            target={slave}
            what="modulesets"
            title={t("objectCompliance.modulesets.encapTitle")}
            editable={editable}
            busy={busy}
            change={change}
          />
          <AttachedPart
            target={slave}
            what="rulesets"
            title={t("objectCompliance.rulesets.encapTitle")}
            editable={editable}
            busy={busy}
            change={change}
          />
        </>
      )}
      <StatusTable
        rows={rows}
        groupBy={groupStatusBy}
        isPending={status.isPending}
        errorMessage={status.isError ? status.error.message : null}
        locale={locale}
      />
    </div>
  );
}
