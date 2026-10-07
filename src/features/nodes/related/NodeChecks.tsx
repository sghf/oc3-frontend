import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { SearchIcon } from "@/components/ui/icons";
import { labelMatches, normalizeSearch } from "@/lib/label-search";
import { useNodeChecks } from "./queries";

type CheckRow = components["schemas"]["CheckRow"];

/** Natural sort of instances: /data2 before /data10. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** The words saying where a check stands, by `chk_err`. */
const STATE_KEY: Record<number, string> = {
  0: "nodes.checks.within",
  1: "nodes.checks.below",
  2: "nodes.checks.above",
};

/**
 * The checks the agent of a node reports, grouped by type. A search narrows them as
 * it is typed: on the type, the instance, the service, the value, the threshold
 * provider and the state, in either language, accents and case aside.
 */
export function NodeChecks({ nodeId, locale }: { nodeId: string; locale: string }) {
  const { t, i18n } = useTranslation();
  const checks = useNodeChecks(nodeId);
  const all = checks.data ?? [];
  const [query, setQuery] = useState("");
  const needle = normalizeSearch(query.trim());
  const rows =
    needle === ""
      ? all
      : all.filter((row) => {
          const texts = [
            row.chk_type,
            row.chk_instance,
            row["services.svcname"],
            row.chk_threshold_provider,
            row.chk_value === undefined || row.chk_value === null
              ? undefined
              : String(row.chk_value),
          ];
          if (texts.some((text) => text != null && normalizeSearch(text).includes(needle)))
            return true;
          const state =
            row.chk_err === undefined || row.chk_err === null ? undefined : STATE_KEY[row.chk_err];
          return state !== undefined && labelMatches(i18n, state, needle);
        });

  // Grouped by type, as the agent reports them: a type is one kind of measure.
  const types = [...new Set(rows.map((row) => row.chk_type ?? ""))].sort(collator.compare);
  const groups = types.map((type) => ({
    key: type,
    label: type,
    rows: rows
      .filter((row) => (row.chk_type ?? "") === type)
      .sort((a, b) => collator.compare(a.chk_instance ?? "", b.chk_instance ?? "")),
  }));
  // Checks are reported together: the latest update dates them all.
  const updated = all.reduce<string | undefined>(
    (latest, row) =>
      row.chk_updated !== undefined && (latest === undefined || row.chk_updated > latest)
        ? row.chk_updated
        : latest,
    undefined,
  );

  const columns: RelatedColumn<CheckRow>[] = [
    {
      key: "chk_instance",
      label: t("nodes.checks.fields.chk_instance"),
      grow: true,
      render: (row) => <code>{row.chk_instance}</code>,
    },
    {
      key: "services.svcname",
      label: t("nodes.checks.fields.object"),
      render: (row) =>
        row["services.svcname"] === null || row["services.svcname"] === undefined ? null : (
          <CrossLink kind="service" id={row.svc_id}>
            {row["services.svcname"]}
          </CrossLink>
        ),
    },
    {
      key: "chk_value",
      label: t("nodes.checks.fields.chk_value"),
      numeric: true,
      render: (row) => row.chk_value,
    },
    {
      key: "thresholds",
      label: t("nodes.checks.fields.thresholds"),
      render: (row) =>
        (row.chk_low ?? null) === null && (row.chk_high ?? null) === null ? (
          <span className="text-ink-muted">{t("nodes.checks.noThresholds")}</span>
        ) : (
          <>
            <span className="tabular-nums">
              {row.chk_low ?? "−∞"} – {row.chk_high ?? "+∞"}
            </span>{" "}
            <span className="text-ink-muted">{row.chk_threshold_provider}</span>
          </>
        ),
    },
    {
      key: "chk_err",
      label: t("nodes.checks.fields.chk_err"),
      // Out of bounds is said with a glyph and a word, not by its color alone.
      render: (row) =>
        row.chk_err === 1 ? (
          <span className="text-state-down">▼ {t("nodes.checks.below")}</span>
        ) : row.chk_err === 2 ? (
          <span className="text-state-down">▲ {t("nodes.checks.above")}</span>
        ) : row.chk_err === 0 ? (
          <span className="text-state-up">● {t("nodes.checks.within")}</span>
        ) : null,
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
            placeholder={t("nodes.checks.search")}
            aria-label={t("nodes.checks.search")}
            className="w-full bg-transparent text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        {checks.isSuccess && all.length > 0 && (
          <p role="status" className="text-ink-muted tabular-nums">
            {needle === ""
              ? t("nodes.checks.count", { count: all.length })
              : t("nodes.checks.matching", { count: rows.length, total: all.length })}
          </p>
        )}
      </div>
      {updated !== undefined && (
        <p className="text-ink-muted">
          {t("nodes.checks.reported")} <RelativeTime value={updated} locale={locale} />
        </p>
      )}
      <RelatedTable
        columns={columns}
        groups={groups}
        rowKey={(row) => String(row.id ?? `${row.chk_type ?? ""}:${row.chk_instance ?? ""}`)}
        isPending={checks.isPending}
        errorMessage={checks.isError ? checks.error.message : null}
        empty={
          needle !== "" && all.length > 0
            ? t("nodes.checks.noMatch", { query: query.trim() })
            : t("nodes.checks.empty")
        }
        caption={t("nodes.related.checks")}
      />
    </div>
  );
}
