import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FlashScope } from "@/components/opensvc/Flash";
import {
  RelatedTable,
  type RelatedColumn,
  type RelatedGroup,
} from "@/components/opensvc/RelatedTable";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { SearchBox } from "@/components/ui/SearchBox";
import { matchesSearch } from "@/lib/search-match";
import { useServiceResinfo, type ServiceResinfo as ResinfoRow } from "./queries";

/**
 * The keys and values the resources of the service declare, the historical
 * Resinfo tab: one group per node, each key under its resource. A search narrows
 * them as it is typed, on the resource, the key and the value.
 */
export function ServiceResinfo({ svcId, locale }: { svcId: string; locale: string }) {
  const { t } = useTranslation();
  const resinfo = useServiceResinfo(svcId);
  const [query, setQuery] = useState("");
  const all = resinfo.data ?? [];
  const needle = query.trim().toLowerCase();
  const rows = all.filter((row) => matchesSearch(needle, row.rid, row.res_key, row.res_value));

  const groups = new Map<string, RelatedGroup<ResinfoRow>>();
  for (const row of rows) {
    const key = row.node_id ?? "";
    const group = groups.get(key) ?? { key, label: row.nodename, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const columns: RelatedColumn<ResinfoRow>[] = [
    {
      key: "rid",
      label: t("resources.fields.rid"),
      render: (row) => <span className="font-mono">{row.rid}</span>,
    },
    {
      key: "res_key",
      label: t("services.resinfo.key"),
      render: (row) => <span className="font-mono">{row.res_key}</span>,
    },
    {
      key: "res_value",
      label: t("services.resinfo.value"),
      grow: true,
      wrap: true,
      render: (row) => <span className="font-mono break-all">{row.res_value}</span>,
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
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={query} onChange={setQuery} label={t("services.resinfo.search")} />
        {resinfo.isSuccess && (
          <p role="status" className="text-ink-muted tabular-nums">
            {needle === ""
              ? t("services.resinfo.count", { count: all.length })
              : t("services.resinfo.matching", { count: rows.length, total: all.length })}
          </p>
        )}
      </div>
      {/* Rows a search brings back are no live update: they do not flash. */}
      <FlashScope subject={needle}>
        <RelatedTable
          columns={columns}
          groups={[...groups.values()].sort((a, b) => a.label.localeCompare(b.label))}
          rowKey={(row) =>
            String(row.id ?? `${row.node_id ?? ""}/${row.rid ?? ""}/${row.res_key ?? ""}`)
          }
          // Each report renews the date: a row flashes when its value changes.
          flashSignature={(row) => JSON.stringify({ ...row, updated: undefined })}
          isPending={resinfo.isPending}
          errorMessage={resinfo.isError ? resinfo.error.message : null}
          empty={needle === "" ? t("services.resinfo.empty") : t("services.resinfo.noMatch")}
          caption={t("services.related.resinfo")}
        />
      </FlashScope>
    </div>
  );
}
