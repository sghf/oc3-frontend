import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { RunLog, RunStatus } from "@/components/opensvc/ComplianceRun";
import { problemText } from "@/lib/api/problem";
import { formatDateTime } from "@/lib/format";
import { OBSOLETE_DAYS, isObsoleteRun } from "./compliance-run";

/** A module run, as the compliance log and the compliance status both give it. */
type RunRow = components["schemas"]["ComplianceLogRow"];

/**
 * Where the run comes from: the compliance log, every run kept, or the compliance
 * status, the last check of each module, node and service.
 */
export type ComplianceRunSource = "log" | "status";

const text = (prop: keyof RunRow) => (row: RunRow) => {
  const value = row[prop];
  // The joined names are null when the run names no service, or a node gone since.
  return value === undefined || value === null ? undefined : String(value);
};

const field = (prop: keyof RunRow) => ({ prop, format: text(prop) });

/**
 * The run, the node and the service it ran for, the ruleset it was given, then its
 * output. In the status, a check older than OBSOLETE_DAYS keeps its status,
 * greyed, as in the list: it is the last one known.
 */
function groups(source: ComplianceRunSource): DetailGroup<RunRow>[] {
  return [
    {
      key: "run",
      family: "moduleset",
      fields: [
        { prop: "run_date", format: (row) => formatDateTime(row.run_date) },
        field("run_module"),
        field("run_action"),
        {
          prop: "run_status",
          format: text("run_status"),
          render: (row) => (
            <RunStatus
              value={row.run_status}
              outdated={source === "status" && isObsoleteRun(row.run_date, Date.now())}
            />
          ),
        },
      ],
    },
    {
      key: "object",
      family: "node",
      fields: [
        linkedField<RunRow>("nodes.nodename", "node", (row) => row.node_id, text("nodes.nodename")),
        field("node_id"),
        linkedField<RunRow>(
          "services.svcname",
          "service",
          (row) => row.svc_id,
          text("services.svcname"),
        ),
        field("svc_id"),
      ],
    },
    {
      key: "ruleset",
      family: "ruleset",
      fields: [
        {
          ...field("rset_md5"),
          render: (row) => <span className="font-mono">{row.rset_md5}</span>,
        },
        field("id"),
      ],
    },
    // The output, under its own heading at the width of the panel: a log of several
    // lines does not fit the value column of a property.
    { key: "output", family: "alert", fields: [] },
  ];
}

const LOG_GROUPS = groups("log");
const STATUS_GROUPS = groups("status");

const PROPS = [
  "id",
  "run_date",
  "run_module",
  "run_action",
  "run_status",
  "run_log",
  "rset_md5",
  "nodes.nodename",
  "node_id",
  "services.svcname",
  "svc_id",
].join(",");

async function fetchRun(source: ComplianceRunSource, id: string): Promise<RunRow | null> {
  const query = { props: PROPS };
  const response =
    source === "log"
      ? await api.GET("/compliance/logs/{log_id}", { params: { path: { log_id: id }, query } })
      : await api.GET("/compliance/status/{status_id}", {
          params: { path: { status_id: id }, query },
        });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  const rows: RunRow[] = Array.isArray(response.data.data) ? response.data.data : [];
  return rows[0] ?? null;
}

/**
 * A module run of the compliance log or of the compliance status, opened from its
 * row: read-only, as both are, its output in full.
 */
export function ComplianceRunDetailPanel({
  source,
  runId,
  label,
  onClose,
}: {
  source: ComplianceRunSource;
  runId: string | undefined;
  /** What the row says of the run, shown while the panel reads it. */
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    data: run,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [source === "log" ? "compliance-log" : "compliance-status-run", runId],
    enabled: runId !== undefined,
    queryFn: () => fetchRun(source, runId ?? ""),
  });

  const output =
    run?.run_log === undefined || run.run_log === "" ? (
      <p className="text-ink-muted">{t("complianceRun.noOutput")}</p>
    ) : (
      <div className="max-h-[60vh] overflow-auto rounded-(--radius-control) border border-line bg-surface-sunken p-2 text-data">
        <RunLog value={run.run_log} />
      </div>
    );
  const obsolete =
    source === "status" && run !== null && run !== undefined
      ? isObsoleteRun(run.run_date, Date.now())
      : false;

  return (
    <DetailPanel
      kind={source === "log" ? "complianceLog" : "complianceStatus"}
      open={runId !== undefined}
      title={
        run?.run_module !== undefined
          ? [run.run_module, run.run_action]
              .filter((part) => part !== undefined && part !== "")
              .join(" · ")
          : label === ""
            ? t("complianceRun.title")
            : label
      }
      onClose={onClose}
      before={
        obsolete ? (
          <p role="note" className="mb-3 text-ink-muted">
            <span aria-hidden="true">▲ </span>
            {t("complianceRun.obsolete", { days: OBSOLETE_DAYS })}
          </p>
        ) : undefined
      }
      groups={source === "log" ? LOG_GROUPS : STATUS_GROUPS}
      row={run}
      // The labels of the log's columns, a superset of the status's, worded alike.
      labelPrefix="complianceLogs.fields"
      groupPrefix="complianceRun.groups"
      groupFooters={{ output }}
      isPending={isPending}
      errorMessage={isError ? error.message : null}
    />
  );
}
