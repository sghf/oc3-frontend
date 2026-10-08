import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { ColumnFamilyIcon } from "./ColumnFamily";
import { RelatedTable, type RelatedColumn, type RelatedGroup } from "./RelatedTable";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { formatSizeMiB } from "@/lib/format";

type DiskRow = components["schemas"]["DiskRow"];
type HbaRow = components["schemas"]["HbaRow"];

/** Usual labels of the transports: the collector stores "iscsi", "fc"… */
const HBA_TYPES: Record<string, string> = {
  iscsi: "iSCSI",
  fc: "Fibre Channel",
  fcoe: "FCoE",
  sas: "SAS",
};

interface Loaded<T> {
  groups: RelatedGroup<T>[];
  isPending: boolean;
  errorMessage: string | null;
}

function count<T>(section: Loaded<T>): number | undefined {
  return section.isPending
    ? undefined
    : section.groups.reduce((sum, group) => sum + group.rows.length, 0);
}

/**
 * Storage of an object: its host bus adapters, then its disks, each under a heading
 * with its count. The adapters first: they are what gives access to the shared disks.
 * Each object chooses its groupings — by service for a node, by node for a service.
 */
export function StorageSections({
  hbas,
  disks,
  locale,
  headerTop,
  searching = false,
}: {
  hbas: Loaded<HbaRow>;
  disks: Loaded<DiskRow>;
  locale: string;
  /** The rows are narrowed by a search: an empty section says that none matches. */
  searching?: boolean;
  /** Where the table headers stick, see `RelatedTable`. */
  headerTop?: string;
}) {
  const { t } = useTranslation();
  const hbaCount = count(hbas);
  const diskCount = count(disks);
  const diskRows = disks.groups.flatMap((group) => group.rows);
  const total = diskRows.reduce((sum, row) => sum + (row.disk_size ?? 0), 0);

  const hbaColumns: RelatedColumn<HbaRow>[] = [
    {
      key: "hba_id",
      label: t("storage.hbas.fields.hba_id"),
      grow: true,
      render: (row) => <code className="break-all">{row.hba_id}</code>,
    },
    {
      key: "hba_type",
      label: t("storage.hbas.fields.hba_type"),
      render: (row) =>
        row.hba_type === null || row.hba_type === undefined
          ? ""
          : (HBA_TYPES[row.hba_type] ?? row.hba_type),
    },
    {
      key: "updated",
      label: t("storage.hbas.fields.updated"),
      render: (row) => <RelativeTime value={row.updated} locale={locale} />,
    },
  ];

  const diskColumns: RelatedColumn<DiskRow>[] = [
    {
      key: "disk_id",
      label: t("storage.disks.fields.disk_id"),
      render: (row) => (
        <Link
          to="/disks"
          search={{ sel: row.disk_id ?? "" }}
          title={t("storage.disks.open")}
          className="underline decoration-line underline-offset-2"
        >
          <code>{row.disk_id}</code>
        </Link>
      ),
    },
    {
      key: "disk_size",
      label: t("storage.disks.fields.disk_size"),
      numeric: true,
      render: (row) => formatSizeMiB(row.disk_size, locale),
    },
    {
      key: "disk_used",
      label: t("storage.disks.fields.disk_used"),
      numeric: true,
      render: (row) => formatSizeMiB(row.disk_used, locale),
    },
    {
      key: "disk_model",
      label: t("storage.disks.fields.disk_model"),
      grow: true,
      render: (row) =>
        [row.disk_vendor?.trim(), row.disk_model?.trim()]
          .filter((part) => part !== undefined && part !== "")
          .join(" "),
    },
    {
      key: "disk_dg",
      label: t("storage.disks.fields.disk_dg"),
      render: (row) => row.disk_dg,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-ink-muted">
          <ColumnFamilyIcon family="network" />
          {t("storage.hbas.title")}
          {hbaCount !== undefined && <span className="font-normal tabular-nums">({hbaCount})</span>}
        </h3>
        <RelatedTable
          headerTop={headerTop}
          columns={hbaColumns}
          groups={hbas.groups}
          rowKey={(row) => `${row.node_id ?? ""}:${row.hba_id ?? ""}`}
          isPending={hbas.isPending}
          errorMessage={hbas.errorMessage}
          empty={searching ? t("storage.hbas.noMatch") : t("storage.hbas.empty")}
          caption={t("storage.hbas.title")}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-ink-muted">
          <ColumnFamilyIcon family="disk" />
          {t("storage.disks.title")}
          {diskCount !== undefined && (
            <span className="font-normal tabular-nums">({diskCount})</span>
          )}
        </h3>
        {diskRows.length > 0 && (
          <p className="text-ink-muted">
            {t("storage.disks.total", {
              count: diskRows.length,
              size: formatSizeMiB(total, locale),
            })}
          </p>
        )}
        <RelatedTable
          headerTop={headerTop}
          columns={diskColumns}
          groups={disks.groups}
          rowKey={(row) => `${row.disk_id ?? ""}:${row.node_id ?? ""}:${row.svc_id ?? ""}`}
          isPending={disks.isPending}
          errorMessage={disks.errorMessage}
          empty={searching ? t("storage.disks.noMatch") : t("storage.disks.empty")}
          caption={t("storage.disks.title")}
        />
      </section>
    </div>
  );
}
