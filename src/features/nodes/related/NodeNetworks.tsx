import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FlashScope } from "@/components/opensvc/Flash";
import type { components } from "@/lib/api/schema";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { SearchBox } from "@/components/ui/SearchBox";
import { matchesSearch } from "@/lib/search-match";
import { useNodeIps } from "./queries";

type IpRow = components["schemas"]["IpRow"];

/** Natural sort of interface names: eth2 before eth10. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** IPv4 before IPv6, then addresses in natural order. */
function compareIps(a: IpRow, b: IpRow): number {
  const family = (row: IpRow) => (row.type === "ipv4" ? 0 : 1);
  return family(a) - family(b) || collator.compare(a.addr ?? "", b.addr ?? "");
}

/**
 * Network addresses of the node, grouped by interface. A search narrows them as it
 * is typed, on the address, interface, MAC, type, network and gateway; the
 * interfaces left empty go.
 */
export function NodeNetworks({
  nodeId,
  headerTop,
}: {
  nodeId: string;
  /** Where the table header sticks, see `RelatedTable`. */
  headerTop?: string;
}) {
  const { t } = useTranslation();
  const ips = useNodeIps(nodeId);
  const [query, setQuery] = useState("");
  const all = ips.data ?? [];
  const needle = query.trim().toLowerCase();
  const rows = all.filter((row) =>
    matchesSearch(
      needle,
      row.addr,
      row.intf,
      row.mac,
      row.type,
      row.net_name,
      row.net_network,
      row.net_gateway,
    ),
  );

  // Grouped by interface: this is how the network configuration of a host reads.
  const interfaces = [...new Set(rows.map((row) => row.intf ?? ""))].sort(collator.compare);
  const groups = interfaces.map((intf) => {
    const members = rows.filter((row) => (row.intf ?? "") === intf).sort(compareIps);
    const mac = members.find((row) => row.mac !== undefined && row.mac !== "")?.mac;
    return {
      key: intf,
      label: mac === undefined ? intf : `${intf} · ${mac}`,
      rows: members,
    };
  });

  const columns: RelatedColumn<IpRow>[] = [
    {
      key: "addr",
      label: t("nodes.networks.fields.addr"),
      render: (row) => (
        <Link
          to="/networks"
          search={{ sel: String(row.id) }}
          title={t("nodes.networks.open")}
          className="underline decoration-line underline-offset-2"
        >
          <code>
            {row.addr}
            {row.mask !== undefined && row.mask !== "" ? `/${row.mask}` : ""}
          </code>
        </Link>
      ),
    },
    {
      key: "type",
      label: t("nodes.networks.fields.type"),
      render: (row) => (row.type === "ipv6" ? "IPv6" : row.type === "ipv4" ? "IPv4" : row.type),
    },
    {
      key: "net_name",
      label: t("nodes.networks.fields.net_name"),
      grow: true,
      // Address outside any network declared to the collector: said rather than left blank.
      render: (row) =>
        row.net_name !== undefined && row.net_name !== "" ? (
          <>
            {row.net_name}{" "}
            <span className="text-ink-muted">
              {row.net_network}
              {row.net_netmask !== undefined && row.net_netmask !== "" ? `/${row.net_netmask}` : ""}
            </span>
          </>
        ) : (
          <span className="text-ink-muted">{t("nodes.networks.undeclared")}</span>
        ),
    },
    {
      key: "net_gateway",
      label: t("nodes.networks.fields.net_gateway"),
      render: (row) => <code>{row.net_gateway}</code>,
    },
    {
      key: "flag_deprecated",
      label: t("nodes.networks.fields.flag_deprecated"),
      render: (row) =>
        row.flag_deprecated === 1 ? (
          <span className="text-state-warn">▲ {t("nodes.networks.deprecated")}</span>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={query} onChange={setQuery} label={t("nodes.networks.search")} />
        {ips.isSuccess && (
          <p role="status" className="text-ink-muted tabular-nums">
            {needle === ""
              ? t("nodes.networks.count", { count: all.length })
              : t("nodes.networks.matching", { count: rows.length, total: all.length })}
          </p>
        )}
      </div>
      {/* Rows a search brings back are no live update: they do not flash. */}
      <FlashScope subject={needle}>
        <RelatedTable
          columns={columns}
          groups={groups}
          rowKey={(row) => String(row.id ?? `${row.intf ?? ""}:${row.addr ?? ""}`)}
          isPending={ips.isPending}
          errorMessage={ips.isError ? ips.error.message : null}
          empty={needle === "" ? t("nodes.networks.empty") : t("nodes.networks.noMatch")}
          caption={t("nodes.related.networks")}
          headerTop={headerTop}
        />
      </FlashScope>
    </div>
  );
}
