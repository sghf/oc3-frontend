import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { FrozenMark } from "@/components/opensvc/FrozenMark";
import { LastReport } from "@/components/opensvc/LastReport";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import { isOutdated, REPORTING_TICK_MS } from "@/components/opensvc/reporting";
import { statusBadge } from "@/components/opensvc/status";
import { InstanceActionsMenu } from "@/features/instances/InstanceActionsMenu";
import { toInstanceId } from "@/features/instances/instance-id";
import { SelectionBar } from "@/components/opensvc/SelectionBar";
import { useNow } from "@/lib/use-now";
import { useServiceInstances } from "./queries";

type InstanceRow = components["schemas"]["InstanceRow"];

/**
 * The instances of the service, the historical Status tab: one per node, and per
 * container of an encapsulated service, with the states the agent last reported,
 * greyed once too old. The node opens its record, the overall status the
 * instance's. Ticked, instances get the actions menu of the Instances list.
 */
export function ServiceInstances({ svcId, locale }: { svcId: string; locale: string }) {
  const { t } = useTranslation();
  const instances = useServiceInstances(svcId);
  // The reports age while the tile stays open: the outdated states follow.
  const now = useNow(REPORTING_TICK_MS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rows = instances.data ?? [];
  const idOf = (row: InstanceRow) => toInstanceId(row.svc_id, row.node_id, row.mon_vmname) ?? "";
  const nameOf = (row: InstanceRow) => {
    const node = row["nodes.nodename"] ?? row.node_id ?? "";
    const vmname = row.mon_vmname ?? "";
    return `${row["services.svcname"] ?? svcId} @ ${vmname === "" ? node : `${node}/${vmname}`}`;
  };
  const ticked = rows.filter((row) => selected.has(idOf(row)));
  const encapsulated = rows.some((row) => (row.mon_vmname ?? "") !== "");

  const status = (row: InstanceRow, value: string | null | undefined) =>
    typeof value === "string" && value !== "" ? (
      <StatusBadge {...statusBadge(value)} outdated={isOutdated(row.mon_updated, now)} />
    ) : null;

  const columns: RelatedColumn<InstanceRow>[] = [
    {
      key: "node",
      label: t("instances.fields.nodes.nodename"),
      grow: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          <FrozenMark frozen={row.mon_frozen === "1"} reserveSpace />
          <CrossLink kind="node" id={row.node_id}>
            {row["nodes.nodename"] ?? row.node_id}
          </CrossLink>
        </span>
      ),
    },
    ...(encapsulated
      ? [
          {
            key: "mon_vmname",
            label: t("instances.fields.mon_vmname"),
            render: (row: InstanceRow) => row.mon_vmname,
          },
        ]
      : []),
    {
      key: "mon_availstatus",
      label: t("instances.fields.mon_availstatus"),
      render: (row) => status(row, row.mon_availstatus),
    },
    {
      key: "mon_overallstatus",
      label: t("instances.fields.mon_overallstatus"),
      render: (row) => (
        <CrossLink kind="instance" id={idOf(row) || undefined}>
          {status(row, row.mon_overallstatus)}
        </CrossLink>
      ),
    },
    {
      key: "mon_updated",
      label: t("instances.fields.mon_updated"),
      render: (row) => (
        <LastReport
          value={row.mon_updated}
          locale={locale}
          outdated={isOutdated(row.mon_updated, now)}
        />
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
        <InstanceActionsMenu
          instances={ticked.map((row) => ({ id: idOf(row), name: nameOf(row) }))}
          onDeleted={(ids) => {
            const next = new Set(selected);
            for (const id of ids) next.delete(id);
            setSelected(next);
          }}
        />
      </SelectionBar>
      <RelatedTable
        columns={columns}
        groups={[{ key: "all", label: "", rows }]}
        rowKey={idOf}
        // Each report renews mon_updated: a row flashes when a state changes.
        flashSignature={(row) => JSON.stringify({ ...row, mon_updated: undefined })}
        isPending={instances.isPending}
        errorMessage={instances.isError ? instances.error.message : null}
        empty={t("services.instances.empty")}
        caption={t("services.related.instances")}
        selection={{ selected, onChange: setSelected, rowLabel: nameOf }}
      />
    </div>
  );
}
