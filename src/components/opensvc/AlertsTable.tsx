import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FlashScope } from "@/components/opensvc/Flash";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { SeverityBadge } from "@/components/opensvc/SeverityBadge";
import { severityLevel } from "@/components/opensvc/severity";
import type { AlertRow } from "./alerts";
import { SearchBox } from "@/components/ui/SearchBox";
import { matchesSearch } from "@/lib/search-match";
import { RelativeTime } from "@/components/ui/RelativeTime";

/**
 * Alerts of a node or a service, as the dashboard lists them, each opening there.
 * A search narrows them as it is typed, on the type, the message, the environment
 * and the severity as it reads (critical, warning, info).
 */
export function AlertsTable({
  alerts,
  locale,
  empty,
  caption,
}: {
  alerts: UseQueryResult<AlertRow[]>;
  locale: string;
  /** Text shown when the object has no alert. */
  empty: string;
  /** Accessible name of the table. */
  caption: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const all = alerts.data ?? [];
  const needle = query.trim().toLowerCase();
  const rows = all.filter((row) =>
    matchesSearch(
      needle,
      row.dash_type,
      row.alert,
      row.dash_env,
      t(`dashboard.severity.${severityLevel(row.dash_severity ?? 0).key}`),
    ),
  );

  const columns: RelatedColumn<AlertRow>[] = [
    {
      key: "dash_severity",
      label: t("alerts.fields.dash_severity"),
      render: (row) => <SeverityBadge severity={row.dash_severity ?? 0} />,
    },
    {
      key: "dash_type",
      label: t("alerts.fields.dash_type"),
      grow: true,
      // The type serves as the message when the alert has no other.
      render: (row) => (
        <Link
          to="/"
          search={{ sel: String(row.id) }}
          title={t("nodes.alerts.open")}
          className="underline decoration-line underline-offset-2"
        >
          {row.dash_type}
          {row.alert !== undefined && row.alert !== "" && (
            <span className="block text-ink-muted no-underline">{row.alert}</span>
          )}
        </Link>
      ),
    },
    {
      key: "dash_updated",
      label: t("alerts.fields.dash_updated"),
      render: (row) => <RelativeTime value={row.dash_updated} locale={locale} />,
    },
    {
      key: "dash_created",
      label: t("alerts.fields.dash_created"),
      render: (row) => <RelativeTime value={row.dash_created} locale={locale} />,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={query} onChange={setQuery} label={t("nodes.alerts.search")} />
        {alerts.isSuccess && (
          <p role="status" className="text-ink-muted tabular-nums">
            {needle === ""
              ? t("nodes.alerts.count", { count: all.length })
              : t("nodes.alerts.matching", { count: rows.length, total: all.length })}
          </p>
        )}
      </div>
      {/* Rows a search brings back are no live update: they do not flash. */}
      <FlashScope subject={needle}>
        <RelatedTable
          columns={columns}
          groups={[{ key: "all", label: "", rows }]}
          rowKey={(row) => String(row.id)}
          isPending={alerts.isPending}
          errorMessage={alerts.isError ? alerts.error.message : null}
          empty={needle === "" ? empty : t("nodes.alerts.noMatch")}
          caption={caption}
        />
      </FlashScope>
    </div>
  );
}
