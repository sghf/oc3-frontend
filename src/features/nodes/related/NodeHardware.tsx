import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FlashScope } from "@/components/opensvc/Flash";
import type { components } from "@/lib/api/schema";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { SearchBox } from "@/components/ui/SearchBox";
import { matchesSearch } from "@/lib/search-match";
import { useNodeHardware } from "./queries";

type NodeHardwareRow = components["schemas"]["NodeHardwareRow"];

/** Families in display order: memory, which is short, before the long PCI list. */
const TYPE_ORDER = ["mem", "cpu", "pci", "usb", "disk"];

/**
 * Hardware components of the node, grouped by family. A search narrows them as it
 * is typed, on the path, class, description, driver and family; the families left
 * empty go.
 */
export function NodeHardware({
  nodeId,
  locale,
  headerTop,
}: {
  nodeId: string;
  locale: string;
  /** Where the table header sticks, see `RelatedTable`. */
  headerTop?: string;
}) {
  const { t, i18n } = useTranslation();
  const hardware = useNodeHardware(nodeId);
  const [query, setQuery] = useState("");
  const all = hardware.data ?? [];
  const needle = query.trim().toLowerCase();
  const typeLabel = (type: string) =>
    i18n.exists(`nodes.hardware.types.${type}`)
      ? t(`nodes.hardware.types.${type}`)
      : type.toUpperCase();
  const rows = all.filter((row) =>
    matchesSearch(
      needle,
      row.hw_path,
      row.hw_class,
      row.hw_description,
      row.hw_driver,
      row.hw_type,
      typeLabel(row.hw_type ?? ""),
    ),
  );

  // Grouped by component family: this is how an inventory reads.
  const types = [...new Set(rows.map((row) => row.hw_type ?? ""))].sort(
    (a, b) =>
      (TYPE_ORDER.indexOf(a) + 1 || TYPE_ORDER.length + 1) -
        (TYPE_ORDER.indexOf(b) + 1 || TYPE_ORDER.length + 1) || a.localeCompare(b),
  );
  const groups = types.map((type) => ({
    key: type,
    label: typeLabel(type),
    rows: rows.filter((row) => (row.hw_type ?? "") === type),
  }));

  const columns: RelatedColumn<NodeHardwareRow>[] = [
    {
      key: "hw_path",
      label: t("nodes.hardware.fields.hw_path"),
      render: (row) => <code>{row.hw_path}</code>,
    },
    {
      key: "hw_class",
      label: t("nodes.hardware.fields.hw_class"),
      render: (row) => row.hw_class,
      wrap: true,
    },
    {
      key: "hw_description",
      label: t("nodes.hardware.fields.hw_description"),
      render: (row) => row.hw_description,
      grow: true,
    },
    {
      key: "hw_driver",
      label: t("nodes.hardware.fields.hw_driver"),
      render: (row) => row.hw_driver,
    },
  ];

  // The whole inventory is dated from the same push: it is said once.
  const updated = all.reduce<string | undefined>(
    (latest, row) =>
      row.updated !== undefined && (latest === undefined || row.updated > latest)
        ? row.updated
        : latest,
    undefined,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={query} onChange={setQuery} label={t("nodes.hardware.search")} />
        {hardware.isSuccess && (
          <p role="status" className="text-ink-muted tabular-nums">
            {needle === ""
              ? t("nodes.hardware.count", { count: all.length })
              : t("nodes.hardware.matching", { count: rows.length, total: all.length })}
          </p>
        )}
        {/* The whole list, with its column filters and sorts, on this node only. */}
        <Link
          to="/hardware"
          search={{ "f.node_id": `eq:${nodeId}` }}
          className="ml-auto text-accent hover:underline"
        >
          {t("nodes.hardware.openView")}
        </Link>
      </div>
      {updated !== undefined && (
        <p className="text-ink-muted">
          {t("nodes.hardware.reported")} <RelativeTime value={updated} locale={locale} />
        </p>
      )}
      {/* Rows a search brings back are no live update: they do not flash. */}
      <FlashScope subject={needle}>
        <RelatedTable
          columns={columns}
          groups={groups}
          rowKey={(row) => String(row.id ?? `${row.hw_type ?? ""}:${row.hw_path ?? ""}`)}
          isPending={hardware.isPending}
          errorMessage={hardware.isError ? hardware.error.message : null}
          empty={needle === "" ? t("nodes.hardware.empty") : t("nodes.hardware.noMatch")}
          caption={t("nodes.related.hardware")}
          headerTop={headerTop}
        />
      </FlashScope>
    </div>
  );
}
