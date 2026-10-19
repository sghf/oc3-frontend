import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { FlagSwitch } from "@/components/opensvc/FlagSwitch";
import { FrozenMark } from "@/components/opensvc/FrozenMark";
import { LastReport } from "@/components/opensvc/LastReport";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import { isOutdated, REPORTING_TICK_MS } from "@/components/opensvc/reporting";
import { statusBadge } from "@/components/opensvc/status";
import { SearchIcon } from "@/components/ui/icons";
import { toInstanceId } from "@/features/instances/instance-id";
import { labelMatches, normalizeSearch } from "@/lib/label-search";
import { useNow } from "@/lib/use-now";
import { useNodeServices, type NodeServiceRow } from "./queries";

/**
 * The service instances of a node, as the historical collector's node tab
 * (`table_service_instances_node`): the service, its topology, the container of an
 * encapsulated instance, then the states the agent last reported, greyed once too
 * old. The service name shows the service; the overall status, the instance with
 * its resources on this node. A search narrows them as it is typed: on the
 * service, the topology, the container and the states, in either language.
 *
 * The instances of one service, one per container of an encapsulated service,
 * form a block: the service's own cells, on the left, written once across its
 * rows, its containers counted under its name.
 */
export function NodeServices({ nodeId, locale }: { nodeId: string; locale: string }) {
  const { t, i18n } = useTranslation();
  const services = useNodeServices(nodeId);
  // The reports age while the tab stays open: the outdated states follow.
  const now = useNow(REPORTING_TICK_MS);
  const all = services.data ?? [];
  const [query, setQuery] = useState("");
  const needle = normalizeSearch(query.trim());
  const rows =
    needle === ""
      ? all
      : all.filter((row) => {
          const texts = [
            row["services.svcname"],
            row["services.svc_topology"],
            row.mon_vmtype,
            row.mon_vmname,
            row.mon_availstatus,
            row.mon_overallstatus,
          ];
          if (texts.some((text) => text != null && normalizeSearch(text).includes(needle)))
            return true;
          return [row.mon_availstatus, row.mon_overallstatus].some(
            (value) =>
              value != null && labelMatches(i18n, `state.${statusBadge(value).state}`, needle),
          );
        });

  // The containers of each service on the node, whatever the search keeps.
  const containers = new Map<string, number>();
  for (const row of all)
    containers.set(row.svc_id ?? "", (containers.get(row.svc_id ?? "") ?? 0) + 1);
  const serviceCount = containers.size;

  const status = (row: NodeServiceRow, value: string | null | undefined) =>
    typeof value === "string" ? (
      <StatusBadge {...statusBadge(value)} outdated={isOutdated(row.mon_updated, now)} />
    ) : null;

  const columns: RelatedColumn<NodeServiceRow>[] = [
    {
      key: "services.svcname",
      label: t("instances.fields.services.svcname"),
      grow: true,
      spanBlock: true,
      render: (row) => row["services.svcname"],
      renderBlock: (block) => {
        const [first] = block;
        if (first === undefined) return null;
        const total = containers.get(first.svc_id ?? "") ?? block.length;
        return (
          <>
            <span className="inline-flex items-center gap-1">
              {/* Several containers: each marks its own freezing, on its row. */}
              <FrozenMark frozen={total === 1 && first.mon_frozen === "1"} reserveSpace />
              <CrossLink kind="service" id={first.svc_id}>
                {first["services.svcname"]}
              </CrossLink>
            </span>
            {total > 1 && (
              <span className="block pl-1 text-ink-muted">
                {block.length === total
                  ? t("nodes.services.containers", { count: total })
                  : t("nodes.services.containersOf", { count: block.length, total })}
              </span>
            )}
          </>
        );
      },
    },
    {
      key: "services.svc_ha",
      label: t("instances.fields.services.svc_ha"),
      spanBlock: true,
      render: (row) => (
        <FlagSwitch
          value={row["services.svc_ha"] ?? undefined}
          labelKey="instances.fields.services.svc_ha"
        />
      ),
    },
    {
      key: "services.svc_topology",
      label: t("instances.fields.services.svc_topology"),
      spanBlock: true,
      render: (row) => row["services.svc_topology"],
    },
    {
      key: "mon_vmtype",
      label: t("instances.fields.mon_vmtype"),
      // The columns of the instance itself start here.
      divider: true,
      render: (row) => row.mon_vmtype,
    },
    {
      key: "mon_vmname",
      label: t("instances.fields.mon_vmname"),
      render: (row) =>
        (containers.get(row.svc_id ?? "") ?? 0) > 1 ? (
          <span className="inline-flex items-center gap-1">
            <FrozenMark frozen={row.mon_frozen === "1"} reserveSpace />
            {row.mon_vmname}
          </span>
        ) : (
          row.mon_vmname
        ),
    },
    {
      key: "mon_availstatus",
      label: t("instances.fields.mon_availstatus"),
      render: (row) => status(row, row.mon_availstatus),
    },
    {
      key: "mon_overallstatus",
      label: t("instances.fields.mon_overallstatus"),
      render: (row) => (
        <CrossLink kind="instance" id={toInstanceId(row.svc_id, row.node_id, row.mon_vmname)}>
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-8 w-64 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder={t("nodes.services.search")}
            aria-label={t("nodes.services.search")}
            className="w-full bg-transparent text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        {services.isSuccess && all.length > 0 && (
          <p role="status" className="text-ink-muted tabular-nums">
            {needle === ""
              ? `${t("nodes.services.count", { count: all.length })} · ${t("nodes.services.serviceCount", { count: serviceCount })}`
              : t("nodes.services.matching", { count: rows.length, total: all.length })}
          </p>
        )}
      </div>
      <RelatedTable
        columns={columns}
        groups={[{ key: "all", label: "", rows }]}
        rowKey={(row) => toInstanceId(row.svc_id, row.node_id, row.mon_vmname) ?? ""}
        blockKey={(row) => row.svc_id ?? ""}
        // Each report renews mon_updated: a row flashes when a state changes.
        flashSignature={(row) => JSON.stringify({ ...row, mon_updated: undefined })}
        isPending={services.isPending}
        errorMessage={services.isError ? services.error.message : null}
        empty={
          needle !== "" && all.length > 0
            ? t("nodes.services.noMatch", { query: query.trim() })
            : t("nodes.services.empty")
        }
        caption={t("nodes.related.services")}
      />
    </div>
  );
}
