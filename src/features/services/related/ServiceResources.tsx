import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RelatedTable,
  type RelatedColumn,
  type RelatedGroup,
} from "@/components/opensvc/RelatedTable";
import { SelectionBar } from "@/components/opensvc/SelectionBar";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import { statusBadge } from "@/components/opensvc/status";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { ResourceActionsMenu } from "@/features/resources/ResourceActionsMenu";
import { resourceFlag } from "@/features/resources/resource-format";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { useServiceResources, type ServiceResource } from "./queries";

/**
 * The resources of the service, one group per instance (the node, and the
 * container of an encapsulated service), each with its status, its type and
 * description, its flags and the age of its last report; the first line of its log
 * when it has one. The whole list, with every column, is the Resources view.
 * Ticked, resources get the agent actions of that view.
 */
export function ServiceResources({ svcId, locale }: { svcId: string; locale: string }) {
  const resources = useServiceResources(svcId);
  return (
    <ResourceStatusTable
      rows={resources.data}
      isPending={resources.isPending}
      errorMessage={resources.isError ? resources.error.message : null}
      grouped
      locale={locale}
    />
  );
}

/**
 * The resources of a service or of one of its instances: grouped by instance for a
 * service, a single list for an instance. A user whose privileges allow the
 * resource actions (NodeExec, a Manager) ticks resources to run them, as from
 * the Resources view.
 */
export function ResourceStatusTable({
  rows,
  isPending,
  errorMessage,
  grouped,
  locale,
}: {
  rows: ServiceResource[] | undefined;
  isPending: boolean;
  errorMessage: string | null;
  grouped: boolean;
  locale: string;
}) {
  const { t } = useTranslation();
  const privileges = useEffectivePrivileges();
  const canAct = privileges.data !== undefined && hasPrivilege(privileges.data, ["NodeExec"]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rowKey = (row: ServiceResource) =>
    String(row.id ?? `${row.node_id ?? ""}/${row.vmname ?? ""}/${row.rid ?? ""}`);
  const ticked = canAct ? (rows ?? []).filter((row) => selected.has(rowKey(row))) : [];

  const groups = new Map<string, RelatedGroup<ServiceResource>>();
  for (const row of rows ?? []) {
    const key = grouped ? `${row.node_id ?? ""}/${row.vmname ?? ""}` : "";
    const label =
      row.vmname !== undefined && row.vmname !== ""
        ? `${row.nodename} / ${row.vmname}`
        : row.nodename;
    const group = groups.get(key) ?? { key, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const columns: RelatedColumn<ServiceResource>[] = [
    {
      key: "rid",
      label: t("resources.fields.rid"),
      render: (row) => <span className="font-mono">{row.rid}</span>,
    },
    {
      key: "status",
      label: t("resources.fields.res_status"),
      render: (row) =>
        row.res_status === undefined || row.res_status === "" ? null : (
          <StatusBadge {...statusBadge(row.res_status)} />
        ),
    },
    { key: "type", label: t("resources.fields.res_type"), render: (row) => row.res_type },
    {
      key: "desc",
      label: t("resources.fields.res_desc"),
      grow: true,
      wrap: true,
      render: (row) => {
        const log = (row.res_log ?? "").split("\n").find((line) => line.trim() !== "");
        return (
          <>
            {row.res_desc}
            {log !== undefined && (
              <span
                className="block truncate font-mono text-data text-ink-muted"
                title={row.res_log}
              >
                {log}
              </span>
            )}
          </>
        );
      },
    },
    {
      key: "flags",
      label: t("services.resources.flags"),
      render: (row) => <ResourceFlags row={row} />,
    },
    {
      key: "updated",
      label: t("resources.fields.updated"),
      render: (row) =>
        row.updated === undefined || row.updated === "" ? null : (
          <RelativeTime value={row.updated} locale={locale} />
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <SelectionBar
        count={ticked.length}
        onClear={() => {
          setSelected(new Set());
        }}
      >
        <ResourceActionsMenu resources={ticked} />
      </SelectionBar>
      <RelatedTable
        columns={columns}
        groups={[...groups.values()].sort((a, b) => a.label.localeCompare(b.label))}
        rowKey={rowKey}
        isPending={isPending}
        errorMessage={errorMessage}
        empty={t("services.resources.empty")}
        caption={t("services.related.resources")}
        selection={
          canAct
            ? {
                selected,
                onChange: setSelected,
                rowLabel: (row) =>
                  row.vmname !== undefined && row.vmname !== ""
                    ? `${row.rid ?? ""} @ ${row.nodename}/${row.vmname}`
                    : `${row.rid ?? ""} @ ${row.nodename}`,
              }
            : undefined
        }
      />
    </div>
  );
}

/** The flags set on a resource, in words: those off are not shown. */
function ResourceFlags({ row }: { row: ServiceResource }) {
  const { t } = useTranslation();
  const set = (["res_monitor", "res_disable", "res_optional"] as const).filter(
    (flag) => resourceFlag(row[flag]) === true,
  );
  if (set.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {set.map((flag) => (
        <span key={flag} className="rounded-full bg-surface-sunken px-1.5 text-data text-ink-muted">
          {t(`services.resources.flag.${flag}`)}
        </span>
      ))}
    </span>
  );
}
