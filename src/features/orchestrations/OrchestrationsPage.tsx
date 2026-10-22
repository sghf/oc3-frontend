import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import {
  mergeSearch,
  resetsScroll,
  resolveListSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import type { OrchestrationStep } from "./api";
import {
  fetchOrchestrations,
  orchestrationStats,
  useOrchestrationList,
  type OrchestrationRow,
} from "./list";
import { isRunStatus, RUN_STATUS_OPTIONS } from "./run-status";
import { RunStatusPill } from "./RunStatusPill";
import { BUTTON, PRIMARY } from "./ui";

/** By name, as the list was before it could be sorted. */
const DEFAULT_SORT = ["name"];

const PROPS = [
  "name",
  "description",
  "steps",
  "step_count",
  "last_run_status",
  "last_run_started",
  "run_count",
  "created",
  "updated",
  "updated_by",
  "id",
] as const satisfies readonly (keyof OrchestrationRow)[];

const DEFAULT_COLS: string[] = [
  "name",
  "description",
  "steps",
  "last_run_status",
  "last_run_started",
  "updated",
  "updated_by",
];

/** The steps of a row, read from their JSON; none when it does not read. */
function stepsOf(row: OrchestrationRow): OrchestrationStep[] {
  try {
    const steps: unknown = JSON.parse(row.steps ?? "[]");
    return Array.isArray(steps) ? (steps as OrchestrationStep[]) : [];
  } catch {
    return [];
  }
}

function columns(t: TFunction): ListColumn<OrchestrationRow>[] {
  return PROPS.map((prop): ListColumn<OrchestrationRow> => {
    const base = { prop, labelKey: `orchestrations.columns.${prop}` };
    switch (prop) {
      case "name":
        return { ...base, family: "action", render: (row) => row.name };
      case "description":
        return {
          ...base,
          family: "action",
          render: (row) => <span className="text-ink-muted">{row.description}</span>,
        };
      case "steps":
        return {
          ...base,
          family: "action",
          // The JSON of the steps does not sort; a filter reads their actions.
          sortable: false,
          render: (row) => (
            <ol className="flex flex-wrap gap-x-3 gap-y-0.5">
              {stepsOf(row).map((step, index) => (
                <li key={index} className="whitespace-nowrap">
                  <span className="text-ink-muted tabular-nums">{index + 1}.</span> {step.action}{" "}
                  <span className="text-ink-muted">
                    {t(`orchestrations.kinds.${step.kind}`, { count: 2 })}
                  </span>
                </li>
              ))}
            </ol>
          ),
        };
      case "step_count":
      case "run_count":
      case "id":
        return {
          ...base,
          family: "action",
          numeric: true,
          render: (row) => row[prop],
        };
      case "last_run_status":
        return {
          ...base,
          family: "state",
          filter: { kind: "enum", options: RUN_STATUS_OPTIONS },
          render: (row) =>
            isRunStatus(row.last_run_status) &&
            row.last_run_id !== null &&
            row.last_run_id !== undefined ? (
              <Link
                to="/orchestrations/runs/$runId"
                params={{ runId: String(row.last_run_id) }}
                className="hover:underline"
              >
                <RunStatusPill status={row.last_run_status} />
              </Link>
            ) : (
              <span className="text-ink-muted">{t("orchestrations.neverRun")}</span>
            ),
        };
      case "last_run_started":
      case "created":
      case "updated":
        return {
          ...base,
          family: "time",
          render: (row) => <DateTime value={row[prop] ?? undefined} />,
        };
      case "updated_by":
        return { ...base, family: "team", render: (row) => row.updated_by };
    }
  });
}

/**
 * The orchestrations: the plans of agent actions, step after step, that a
 * Manager writes once and runs when needed, as a collector list — sorted,
 * filtered and paged by the api, the columns chosen. Each row opens the
 * editor; the last run of each plan says how it went, and opens it.
 */
export function OrchestrationsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("orchestrations");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/orchestrations" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/orchestrations" });
  // The last run's link needs its id, whatever the columns shown.
  const props = [...visibleProps(search.cols, DEFAULT_COLS, [...PROPS]), "last_run_id"];
  const list = useOrchestrationList(search, props);

  function update(next: Partial<ResolvedListSearch>) {
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="orchestration" className="h-5 w-5" />
          {t("orchestrations.title")}
        </h1>
        {/* Beside the title: the right edge is where the panel anchor floats (`PanelAnchor`). */}
        <Link to="/orchestrations/runs" className={BUTTON}>
          {t("orchestrations.runs.title")}
        </Link>
        <Link
          to="/orchestrations/$orchestrationId"
          params={{ orchestrationId: "new" }}
          className={PRIMARY}
        >
          ＋ {t("orchestrations.new")}
        </Link>
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("orchestrations.intro")}</p>
      <CollectorList
        columns={columns(t)}
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
        exportPage={(page) => fetchOrchestrations({ ...search, ...page }, page.cols)}
        valueStats={orchestrationStats}
        filterable
        onRowOpen={(row) => {
          if (row.id === undefined) return;
          void navigate({
            to: "/orchestrations/$orchestrationId",
            params: { orchestrationId: String(row.id) },
          });
        }}
      />
    </section>
  );
}
