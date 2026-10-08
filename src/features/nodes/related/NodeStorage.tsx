import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FlashScope } from "@/components/opensvc/Flash";
import { ColumnFamilyIcon } from "@/components/opensvc/ColumnFamily";
import { SanDiagram } from "@/components/opensvc/SanDiagram";
import { StorageSections } from "@/components/opensvc/StorageSections";
import { SearchBox } from "@/components/ui/SearchBox";
import { matchesSearch } from "@/lib/search-match";
import { useNodeDisks, useNodeHbas, useNodeSan } from "./queries";

/**
 * Storage of a node: the diagram of its SAN wiring, then its host bus adapters and
 * its disks, in the order of the historical storage tab. A search narrows the
 * adapters and the disks as it is typed (id and type of an adapter; id, vendor,
 * model, disk group and service of a disk); the diagram stays whole.
 */

export function NodeStorage({
  nodeId,
  locale,
  headerTop,
}: {
  nodeId: string;
  locale: string;
  /** Where the table headers stick, see `RelatedTable`. */
  headerTop?: string;
}) {
  const { t } = useTranslation();
  const disks = useNodeDisks(nodeId);
  const hbas = useNodeHbas(nodeId);
  const san = useNodeSan(nodeId);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const allDisks = disks.data ?? [];
  const allHbas = hbas.data ?? [];
  const rows = allDisks.filter((row) =>
    matchesSearch(
      needle,
      row.disk_id,
      row.disk_vendor,
      row.disk_model,
      row.disk_dg,
      row.svcname,
      row.disk_name,
    ),
  );
  const hbaRows = allHbas.filter((row) => matchesSearch(needle, row.hba_id, row.hba_type));

  // Disks grouped by service: those a service uses, then those of the node alone.
  const services = [...new Set(rows.map((row) => row.svcname ?? ""))].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-ink-muted">
          <ColumnFamilyIcon family="network" />
          {t("storage.san.title")}
        </h3>
        {san.isPending ? (
          <p className="text-ink-muted">{t("storage.san.loading")}</p>
        ) : san.isError ? (
          <p role="alert" className="text-state-down">
            ■ {t("storage.san.error", { message: san.error.message })}
          </p>
        ) : (
          <SanDiagram topology={san.data} />
        )}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={query} onChange={setQuery} label={t("nodes.storage.search")} />
        {needle !== "" && disks.isSuccess && hbas.isSuccess && (
          <p role="status" className="text-ink-muted tabular-nums">
            {t("nodes.storage.matching", {
              disks: rows.length,
              totalDisks: allDisks.length,
              hbas: hbaRows.length,
              totalHbas: allHbas.length,
            })}
          </p>
        )}
      </div>
      {/* Rows a search brings back are no live update: they do not flash. */}
      <FlashScope subject={needle}>
        <StorageSections
          searching={needle !== ""}
          locale={locale}
          headerTop={headerTop}
          hbas={{
            groups: [{ key: "all", label: "", rows: hbaRows }],
            isPending: hbas.isPending,
            errorMessage: hbas.isError ? hbas.error.message : null,
          }}
          disks={{
            groups: services.map((svcname) => ({
              key: svcname === "" ? "-" : svcname,
              label: svcname === "" ? t("storage.disks.unassigned") : svcname,
              rows: rows.filter((row) => (row.svcname ?? "") === svcname),
            })),
            isPending: disks.isPending,
            errorMessage: disks.isError ? disks.error.message : null,
          }}
        />
      </FlashScope>
    </div>
  );
}
