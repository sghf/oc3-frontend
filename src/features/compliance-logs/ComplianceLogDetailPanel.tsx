import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { RunLog, RunStatus } from "@/components/opensvc/ComplianceRun";
import { problemText } from "@/lib/api/problem";
import { formatDateTime } from "@/lib/format";

type ComplianceLogRow = components["schemas"]["ComplianceLogRow"];

const text = (prop: keyof ComplianceLogRow) => (row: ComplianceLogRow) => {
  const value = row[prop];
  // The joined names are null when the run names no service, or a node gone since.
  return value === undefined || value === null ? undefined : String(value);
};

const field = (prop: keyof ComplianceLogRow) => ({ prop, format: text(prop) });

/**
 * Detail of a module run, read-only as the compliance log is: the run, the node
 * and the service it ran for, the ruleset it was given, then its output in full.
 */
const GROUPS: DetailGroup<ComplianceLogRow>[] = [
  {
    key: "run",
    family: "moduleset",
    fields: [
      { prop: "run_date", format: (row, locale) => formatDateTime(row.run_date, locale) },
      field("run_module"),
      field("run_action"),
      {
        prop: "run_status",
        format: text("run_status"),
        render: (row) => <RunStatus value={row.run_status} />,
      },
    ],
  },
  {
    key: "object",
    family: "node",
    fields: [
      linkedField<ComplianceLogRow>(
        "nodes.nodename",
        "node",
        (row) => row.node_id,
        text("nodes.nodename"),
      ),
      field("node_id"),
      linkedField<ComplianceLogRow>(
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

/** A module run of the compliance log, from its row in the list. */
export function ComplianceLogDetailPanel({
  logId,
  label,
  onClose,
}: {
  logId: string | undefined;
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
    queryKey: ["compliance-log", logId],
    enabled: logId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/compliance/logs/{log_id}", {
        params: { path: { log_id: logId ?? "" }, query: { props: PROPS } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: ComplianceLogRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  const output =
    run?.run_log === undefined || run.run_log === "" ? (
      <p className="text-ink-muted">{t("complianceLogs.detail.noOutput")}</p>
    ) : (
      <div className="max-h-[60vh] overflow-auto rounded-(--radius-control) border border-line bg-surface-sunken p-2 text-data">
        <RunLog value={run.run_log} />
      </div>
    );

  return (
    <DetailPanel
      kind="complianceLog"
      open={logId !== undefined}
      title={
        run?.run_module !== undefined
          ? `${run.run_module} · ${run.run_action ?? ""}`
          : label === ""
            ? t("complianceLogs.detail.title")
            : label
      }
      onClose={onClose}
      groups={GROUPS}
      row={run}
      labelPrefix="complianceLogs.fields"
      groupPrefix="complianceLogs.detail.groups"
      groupFooters={{ output }}
      isPending={isPending}
      errorMessage={isError ? error.message : null}
    />
  );
}
