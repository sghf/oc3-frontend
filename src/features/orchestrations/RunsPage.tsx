import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import { formatDuration } from "@/lib/format";
import {
  mergeSearch,
  resetsScroll,
  resolveListSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { fetchRuns, runStats, useRunList, type RunRow } from "./list";
import { isRunStatus, RUN_STATUS_OPTIONS } from "./run-status";
import { RunStatusPill } from "./RunStatusPill";

/** The latest first, as the list was before it could be sorted. */
const DEFAULT_SORT = ["-id"];

const PROPS = [
  "id",
  "name",
  "status",
  "steps_done",
  "step_count",
  "current_step",
  "started",
  "started_by",
  "ended",
  "duration",
  "message",
  "orchestration_id",
] as const satisfies readonly (keyof RunRow)[];

const DEFAULT_COLS: string[] = [
  "id",
  "name",
  "status",
  "steps_done",
  "started",
  "started_by",
  "duration",
  "message",
];

function columns(): ListColumn<RunRow>[] {
  return PROPS.map((prop): ListColumn<RunRow> => {
    const base = { prop, labelKey: `orchestrations.runColumns.${prop}` };
    switch (prop) {
      case "id":
      case "step_count":
      case "orchestration_id":
        return { ...base, family: "action", numeric: true, render: (row) => row[prop] };
      case "current_step":
        // Counted from 1, as the run page names its steps.
        return {
          ...base,
          family: "action",
          numeric: true,
          render: (row) => (row.current_step === undefined ? "" : row.current_step + 1),
        };
      case "name":
        return { ...base, family: "action", render: (row) => row.name };
      case "status":
        return {
          ...base,
          family: "state",
          filter: { kind: "enum", options: RUN_STATUS_OPTIONS },
          render: (row) => (isRunStatus(row.status) ? <RunStatusPill status={row.status} /> : null),
        };
      case "steps_done":
        return {
          ...base,
          family: "state",
          numeric: true,
          render: (row) => `${String(row.steps_done ?? 0)}/${String(row.step_count ?? 0)}`,
        };
      case "started":
      case "ended":
        return {
          ...base,
          family: "time",
          render: (row, locale) => <DateTime value={row[prop] ?? undefined} locale={locale} />,
        };
      case "duration":
        return {
          ...base,
          family: "time",
          numeric: true,
          render: (row, locale) =>
            row.duration === undefined ? (
              "—"
            ) : (
              <span className="whitespace-nowrap">{formatDuration(row.duration, locale)}</span>
            ),
        };
      case "started_by":
        return { ...base, family: "team", render: (row) => row.started_by };
      case "message":
        return {
          ...base,
          family: "alert",
          render: (row) => <span className="text-ink-muted">{row.message}</span>,
        };
    }
  });
}

/**
 * The runs of every orchestration as a collector list — sorted, filtered and
 * paged by the api, the columns chosen — the latest first by default; a row
 * opens the run.
 */
export function RunsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("orchestration-runs");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/orchestrations/runs" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/orchestrations/runs" });
  // The progress reads both counts, whichever of the two is shown.
  const shown = visibleProps(search.cols, DEFAULT_COLS, [...PROPS]);
  const props = shown.includes("steps_done") ? [...shown, "step_count"] : shown;
  const list = useRunList(search, props);

  function update(next: Partial<ResolvedListSearch>) {
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  return (
    <section>
      <div className="mb-1 text-data text-ink-muted">
        <Link to="/orchestrations" className="hover:underline">
          {t("orchestrations.title")}
        </Link>{" "}
        ›
      </div>
      <h1 className="mb-3 flex items-center gap-2 text-title font-semibold">
        <ObjectIcon kind="orchestration" className="h-5 w-5" />
        {t("orchestrations.runs.title")}
      </h1>
      <CollectorList
        columns={columns()}
        defaultCols={DEFAULT_COLS}
        rows={list.data?.rows ?? []}
        rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
        search={search}
        onChange={update}
        isPending={list.isPending}
        isFetching={list.isFetching}
        errorMessage={list.isError ? list.error.message : null}
        hasMore={list.data?.hasMore ?? false}
        total={list.data?.total}
        exportPage={(page) => fetchRuns({ ...search, ...page }, page.cols)}
        valueStats={runStats}
        filterable
        onRowOpen={(row) => {
          if (row.id === undefined) return;
          void navigate({ to: "/orchestrations/runs/$runId", params: { runId: String(row.id) } });
        }}
      />
    </section>
  );
}
